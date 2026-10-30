#!/usr/bin/env node
/**
 * Phase 3 gate — boots the real app and asserts the PRD's channel gate over HTTP + the DB.
 *
 * Why a script and not a unit test: the repo's `node --test` suite covers pure logic only. The
 * Phase 3 gate is about webhook idempotency, channel policy, human actions and ticket rows, so it
 * runs against `next dev` exactly as the dashboard and a provider would meet it.
 *
 *   node --env-file-if-exists=.env scripts/verify-phase3.mjs
 *   VERIFY_PORT=3300 VERIFY_BASE_URL=http://localhost:3000 npm run verify:phase3
 *
 * Every ticket this run creates carries an externalMessageId starting with `gate3-`; cleanup
 * deletes exactly those rows (events cascade), including after a crash of an earlier run.
 *
 * Exit code 0 when every check passes, 1 otherwise. The dev server is killed in `finally`,
 * including when a check throws.
 *
 * Classifier assumption: the R1/R5/AT-09 assertions are deterministic with the offline classifier
 * (`LLM_PROVIDER=heuristic`). With a model provider the R1–R7 routing stays deterministic, but the
 * classifier's confidence/sentiment fields can move which rule matches, so the rule ids in this gate
 * describe the offline deployment it runs against.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.VERIFY_PORT ?? 3124);
/** Point at an already-running app when `next dev` already holds the project lock. */
const EXTERNAL_BASE = process.env.VERIFY_BASE_URL ?? null;
const BASE = EXTERNAL_BASE ?? `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BOOT_TIMEOUT_MS = 90_000;

const CLOUDPULSE = "biz_cloudpulse_01";
const CLINIC = "biz_jaipursmile_02";
const RIVAL = "biz_nimbus_03";
const RUN = `gate3-${Date.now()}`;
/**
 * The provider path is only real when a secret exists. A spawned server gets a generated one;
 * an already-running server must have been started with `CHANNEL_WEBHOOK_SECRET` set.
 */
const WEBHOOK_SECRET =
  (process.env.CHANNEL_WEBHOOK_SECRET ?? "").trim() ||
  (EXTERNAL_BASE === null ? `gate3-secret-${process.pid}` : "");

const logDir = mkdtempSync(join(tmpdir(), "aftersales-gate3-"));
const serverLog = join(logDir, "next-dev.log");
const logStream = createWriteStream(serverLog, { flags: "a" });

let server = null;
let db = null;
let judgeCookie = null;
/** Tickets created without a `gate3-` external id (the text tool) — removed by id in cleanup. */
const createdTicketIds = new Set();
const results = [];

async function database() {
  if (db === null) db = (await import("../src/server/db.ts")).prisma;
  return db;
}

function expect(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok), detail: ok ? "" : detail });
}

function expectIncludes(body, needle, label = `body contains ${JSON.stringify(needle)}`) {
  expect(label, body.includes(needle), body.includes(needle) ? "" : "missing from response body");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function get(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function post(path, body, cookie, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie !== undefined) headers.cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function patch(path, body, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    redirect: "manual",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function postRaw(path, raw, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie === undefined ? {} : { cookie }) },
    body: raw,
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

function sessionCookie(headers) {
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const session = cookies.find((cookie) => cookie.startsWith("as_session="));
  return session === undefined ? null : session.split(";")[0];
}

function startServer() {
  server = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, NODE_ENV: "development", CHANNEL_WEBHOOK_SECRET: WEBHOOK_SECRET },
  });
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
}

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server !== null && server.exitCode !== null) {
      throw new Error(`next dev exited early (code ${server.exitCode}); log: ${serverLog}`);
    }
    try {
      const response = await fetch(`${BASE}/api/health`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await sleep(400);
  }
  throw new Error(`next dev did not answer within ${BOOT_TIMEOUT_MS} ms; log: ${serverLog}`);
}

function stopServer() {
  if (server === null || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

async function group(name, run) {
  const before = results.length;
  process.stdout.write(`\n▸ ${name}\n`);
  try {
    await run();
  } catch (error) {
    expect(
      `${name}: the group itself must not throw`,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
  for (const result of results.slice(before)) {
    const mark = result.ok ? "✓" : "✗";
    const detail = result.detail.length > 0 ? ` — ${result.detail}` : "";
    process.stdout.write(`  ${mark} ${result.label}${detail}\n`);
  }
}

async function cleanup() {
  const problems = [];
  let prisma = null;
  try {
    prisma = await database();
  } catch (error) {
    return [`could not reach the database: ${error instanceof Error ? error.message : String(error)}`];
  }
  try {
    await prisma.ticket.deleteMany({ where: { externalMessageId: { startsWith: "gate3-" } } });
    if (createdTicketIds.size > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: [...createdTicketIds] } } });
      createdTicketIds.clear();
    }
  } catch (error) {
    problems.push(`could not delete gate tickets: ${error instanceof Error ? error.message : String(error)}`);
  }
  await prisma.$disconnect();
  return problems;
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\ninterrupted (${signal}) — stopping the server and cleaning up\n`);
  stopServer();
  const problems = await cleanup();
  logStream.end();
  for (const problem of problems) process.stderr.write(`cleanup: ${problem}\n`);
  process.exit(130);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

async function auth() {
  const signIn = await post("/api/auth/judge-demo");
  expect("POST /api/auth/judge-demo returns 303", signIn.status === 303, `status ${signIn.status}`);
  const cookie = sessionCookie(signIn.headers);
  expect("the judge demo sets an as_session cookie", cookie !== null, "no session cookie");
  if (cookie === null) return;

  const dashboard = await get("/dashboard?tab=queue", cookie);
  expect("GET /dashboard?tab=queue returns 200", dashboard.status === 200, `status ${dashboard.status}`);
  expectIncludes(dashboard.body, "Live queue", "the dashboard renders the Live queue tab");
  judgeCookie = cookie;
}

async function channelState() {
  const whatsapp = parseJson(
    (await get(`/api/channels/webhook/whatsapp?businessId=${CLOUDPULSE}`, judgeCookie)).body,
  );
  expect(
    "CloudPulse WhatsApp readiness is CONNECTED and auto-send",
    whatsapp?.status === "CONNECTED" && whatsapp?.autoSend === true && whatsapp?.configured === true,
    JSON.stringify(whatsapp),
  );

  const instagram = parseJson(
    (await get(`/api/channels/webhook/instagram?businessId=${CLINIC}`, judgeCookie)).body,
  );
  expect(
    "the clinic's Instagram is DRAFT_ONLY with auto-send off",
    instagram?.status === "DRAFT_ONLY" && instagram?.autoSend === false,
    JSON.stringify(instagram),
  );

  const gmail = parseJson(
    (await get(`/api/channels/webhook/gmail?businessId=${CLINIC}`, judgeCookie)).body,
  );
  expect(
    "the clinic's Gmail is TEST_MODE",
    gmail?.status === "TEST_MODE" && gmail?.configured === true,
    JSON.stringify(gmail),
  );

  const unknown = await get(`/api/channels/webhook/telegram?businessId=${CLOUDPULSE}`, judgeCookie);
  expect("an unknown provider answers 404", unknown.status === 404, `status ${unknown.status}`);

  const anonymous = await get(`/api/channels/webhook/whatsapp?businessId=${CLOUDPULSE}`);
  expect("readiness without a session answers 401", anonymous.status === 401, `status ${anonymous.status}`);
}

async function surface() {
  const channels = await get("/dashboard?tab=channels", judgeCookie);
  expect("GET /dashboard?tab=channels returns 200", channels.status === 200, `status ${channels.status}`);
  expectIncludes(channels.body, "Simulate an inbound webhook");
  expectIncludes(channels.body, "externalMessageId");
  expectIncludes(channels.body, "Deliver twice");
  expectIncludes(channels.body, "Instagram DM");
}

async function idempotency() {
  const externalMessageId = `${RUN}-idem`;
  const payload = {
    businessId: CLOUDPULSE,
    externalMessageId,
    customerName: "Gate Judge",
    customerHandle: "+910000000000",
    query: "What is the price of the Pro Plan?",
  };

  const first = await post("/api/channels/webhook/whatsapp", payload, judgeCookie);
  const second = await post("/api/channels/webhook/whatsapp", payload, judgeCookie);
  expect("the first delivery returns 200", first.status === 200, `status ${first.status}`);
  expect("the replay returns 200", second.status === 200, `status ${second.status}`);

  const a = parseJson(first.body);
  const b = parseJson(second.body);
  if (a === null || b === null) {
    expect("both deliveries return JSON", false, first.body.slice(0, 160));
    return;
  }

  expect("the first delivery creates a ticket", a.duplicate === false, `duplicate ${a.duplicate}`);
  expect("the replay is marked duplicate", b.duplicate === true, `duplicate ${b.duplicate}`);
  expect(
    "AT-10: both deliveries name the same ticket",
    typeof a.ticketId === "string" && a.ticketId === b.ticketId,
    `${a.ticketId} vs ${b.ticketId}`,
  );
  expect("the replay does not auto-send", b.shouldAutoSend === false, String(b.shouldAutoSend));

  const prisma = await database();
  const count = await prisma.ticket.count({ where: { businessId: CLOUDPULSE, externalMessageId } });
  expect("AT-10: one ticket row for the replayed id", count === 1, `count ${count}`);

  const detail = parseJson(
    (await get(`/api/businesses/${CLOUDPULSE}/tickets?ticketId=${a.ticketId}`, judgeCookie)).body,
  );
  expect(
    "AT-10: one response — exactly four events on the ticket",
    Array.isArray(detail?.events) && detail.events.length === 4,
    `${Array.isArray(detail?.events) ? detail.events.length : "no"} events`,
  );
}

async function crossTenantIdempotency() {
  const externalMessageId = `${RUN}-cross`;
  const prisma = await database();
  const rival = await prisma.business.findUnique({ where: { id: RIVAL } });
  expect("the rival tenant exists (seed ran)", rival !== null, `${RIVAL} not found`);
  if (rival === null) return;

  // The rival receives a message whose id the judge's next delivery will reuse.
  const { respondToContact } = await import("../src/server/business/service.ts");
  const nimbus = await respondToContact({
    business: rival,
    channel: "GMAIL",
    customerName: "Nimbus customer",
    customerHandle: "customer@nimbus.example",
    query: "What is your refund policy?",
    externalMessageId,
  });
  expect("the rival's own delivery is created", nimbus.duplicate === false, `duplicate ${nimbus.duplicate}`);
  expect(
    "the rival's answer is non-empty (so the leak check below is meaningful)",
    nimbus.answer.length > 0,
    "rival answer was empty",
  );

  const posted = await post(
    "/api/channels/webhook/whatsapp",
    {
      businessId: CLOUDPULSE,
      externalMessageId,
      customerName: "Gate Judge",
      customerHandle: "+910000000002",
      query: "What is the price of the Pro Plan?",
    },
    judgeCookie,
  );
  expect("the judge's delivery returns 200", posted.status === 200, `status ${posted.status}`);
  const answer = parseJson(posted.body);
  if (answer === null) {
    expect("the judge's delivery returns JSON", false, posted.body.slice(0, 160));
    return;
  }

  expect("AT-05: the delivery is not a duplicate of another tenant's id", answer.duplicate === false, `duplicate ${answer.duplicate}`);
  expect(
    "AT-05: the delivery resolves to the session's tenant",
    answer.businessId === CLOUDPULSE,
    `businessId ${answer.businessId}`,
  );
  expect(
    "AT-05: the delivery never returns the other tenant's ticket",
    answer.ticketId !== nimbus.ticketId,
    `ticketId ${answer.ticketId} == rival ${nimbus.ticketId}`,
  );
  expect(
    "AT-05: the delivery never leaks the other tenant's answer",
    answer.answer !== nimbus.answer &&
      !String(answer.answer).includes("No refunds after the first 24 hours"),
    String(answer.answer).slice(0, 80),
  );

  const own = await prisma.ticket.count({ where: { businessId: CLOUDPULSE, externalMessageId } });
  expect("the judge's tenant owns its own ticket row", own === 1, `rows ${own}`);
  const rivalRow = await prisma.ticket.findUnique({ where: { id: nimbus.ticketId } });
  expect(
    "the rival's ticket is untouched",
    rivalRow?.businessId === RIVAL && rivalRow?.customerQuery === "What is your refund policy?",
    JSON.stringify(rivalRow?.businessId),
  );
}

async function providerToken() {
  if (WEBHOOK_SECRET.length === 0) {
    expect(
      "the gate knows the provider secret",
      false,
      "set CHANNEL_WEBHOOK_SECRET in the server's env for a VERIFY_BASE_URL run",
    );
    return;
  }

  const externalMessageId = `${RUN}-token`;
  const payload = {
    businessId: CLOUDPULSE,
    externalMessageId,
    customerName: "Provider Customer",
    customerHandle: "provider@example.com",
    query: "What is the price of the Pro Plan?",
  };

  const delivered = await post("/api/channels/webhook/gmail", payload, undefined, {
    "x-channel-token": WEBHOOK_SECRET,
  });
  expect("a provider delivery without a session returns 200", delivered.status === 200, `status ${delivered.status}`);
  const answer = parseJson(delivered.body);
  if (answer === null) {
    expect("the provider delivery returns JSON", false, delivered.body.slice(0, 160));
    return;
  }
  expect("the provider delivery is a first delivery", answer.duplicate === false, `duplicate ${answer.duplicate}`);
  expect(
    "the provider delivery lands on the business it names",
    answer.businessId === CLOUDPULSE,
    `businessId ${answer.businessId}`,
  );

  const prisma = await database();
  const stored = await prisma.ticket.count({ where: { businessId: CLOUDPULSE, externalMessageId } });
  expect("the provider delivery is persisted", stored === 1, `rows ${stored}`);

  const anonymous = await post("/api/channels/webhook/gmail", payload);
  expect("a delivery with no session and no token answers 401", anonymous.status === 401, `status ${anonymous.status}`);

  const wrongToken = await post("/api/channels/webhook/gmail", payload, undefined, {
    "x-channel-token": "not-the-secret",
  });
  expect("a delivery with a wrong token answers 401", wrongToken.status === 401, `status ${wrongToken.status}`);

  const unknownId = `${RUN}-token-unknown`;
  const unknown = await post(
    "/api/channels/webhook/gmail",
    { ...payload, businessId: "biz_does_not_exist", externalMessageId: unknownId },
    undefined,
    { "x-channel-token": WEBHOOK_SECRET },
  );
  expect("a provider delivery to an unknown business answers 404", unknown.status === 404, `status ${unknown.status}`);
  const phantom = await prisma.ticket.count({ where: { externalMessageId: unknownId } });
  expect("an unknown business creates no ticket", phantom === 0, `rows ${phantom}`);
}

async function webhookTenancy() {
  const externalMessageId = `${RUN}-session-foreign`;
  const posted = await post(
    "/api/channels/webhook/whatsapp",
    {
      businessId: RIVAL,
      externalMessageId,
      customerName: "Gate Judge",
      customerHandle: "+910000000003",
      query: "What is the price of the Pro Plan?",
    },
    judgeCookie,
  );
  expect(
    "AT-05: a session cannot post into another tenant's queue (403)",
    posted.status === 403,
    `status ${posted.status}`,
  );
  const error = parseJson(posted.body);
  expect(
    "the refusal carries the frozen error shape",
    error?.error?.code === 403 && typeof error.error.message === "string",
    posted.body.slice(0, 120),
  );
  const prisma = await database();
  const rows = await prisma.ticket.count({ where: { externalMessageId } });
  expect("the refused delivery writes no row anywhere", rows === 0, `rows ${rows}`);
}

async function replayRace() {
  const externalMessageId = `${RUN}-race`;
  const payload = {
    businessId: CLOUDPULSE,
    externalMessageId,
    customerName: "Gate Judge",
    customerHandle: "+910000000004",
    query: "What is the price of the Pro Plan?",
  };
  const [first, second] = await Promise.all([
    post("/api/channels/webhook/whatsapp", payload, judgeCookie),
    post("/api/channels/webhook/whatsapp", payload, judgeCookie),
  ]);
  expect("both racing deliveries return 200", first.status === 200 && second.status === 200, `${first.status}/${second.status}`);
  const a = parseJson(first.body);
  const b = parseJson(second.body);
  if (a === null || b === null) {
    expect("both racing deliveries return JSON", false, first.body.slice(0, 120));
    return;
  }
  expect(
    "the race resolves to one ticket id for both callers",
    typeof a.ticketId === "string" && a.ticketId === b.ticketId,
    `${a.ticketId} vs ${b.ticketId}`,
  );
  expect(
    "exactly one caller created and one saw the replay",
    [a.duplicate, b.duplicate].sort().join(",") === "false,true",
    `[${a.duplicate}, ${b.duplicate}]`,
  );
  const prisma = await database();
  const count = await prisma.ticket.count({ where: { businessId: CLOUDPULSE, externalMessageId } });
  expect("the race leaves exactly one ticket row", count === 1, `count ${count}`);
  const detail = parseJson(
    (await get(`/api/businesses/${CLOUDPULSE}/tickets?ticketId=${a.ticketId}`, judgeCookie)).body,
  );
  expect(
    "the race leaves exactly one response trail",
    Array.isArray(detail?.events) && detail.events.length === 4,
    `${Array.isArray(detail?.events) ? detail.events.length : "no"} events`,
  );
}

async function malformedPayloads() {
  const prisma = await database();
  const before = await prisma.ticket.count({ where: { businessId: CLOUDPULSE } });

  const notJson = await postRaw("/api/channels/webhook/whatsapp", "{not json", judgeCookie);
  const notJsonBody = parseJson(notJson.body);
  expect("a non-JSON body answers 400", notJson.status === 400, `status ${notJson.status}`);
  expect(
    "the non-JSON refusal carries the frozen error shape",
    notJsonBody?.error?.code === 400 && typeof notJsonBody.error.message === "string",
    notJson.body.slice(0, 120),
  );

  const missingId = await post(
    "/api/channels/webhook/whatsapp",
    { businessId: CLOUDPULSE, query: "hello" },
    judgeCookie,
  );
  const missingIdBody = parseJson(missingId.body);
  expect("a missing externalMessageId answers 400", missingId.status === 400, `status ${missingId.status}`);
  expect(
    "the refusal names the missing field",
    missingIdBody?.error?.code === 400 && String(missingIdBody.error.message).includes("externalMessageId"),
    missingId.body.slice(0, 120),
  );

  const oversized = await post(
    "/api/channels/webhook/whatsapp",
    { businessId: CLOUDPULSE, externalMessageId: `${RUN}-malformed-big`, query: "x".repeat(4001) },
    judgeCookie,
  );
  expect("an oversized query answers 400", oversized.status === 400, `status ${oversized.status}`);

  const unknownProvider = await post(
    "/api/channels/webhook/telegram",
    { businessId: CLOUDPULSE, externalMessageId: `${RUN}-malformed-provider`, query: "hello" },
    judgeCookie,
  );
  const unknownBody = parseJson(unknownProvider.body);
  expect("an unknown provider answers 404", unknownProvider.status === 404, `status ${unknownProvider.status}`);
  expect(
    "the unknown provider carries the frozen error shape",
    unknownBody?.error?.code === 404,
    unknownProvider.body.slice(0, 120),
  );

  const after = await prisma.ticket.count({ where: { businessId: CLOUDPULSE } });
  expect("no malformed delivery creates a ticket", after === before, `${before} -> ${after}`);
  const stray = await prisma.ticket.count({
    where: { externalMessageId: { startsWith: `${RUN}-malformed` } },
  });
  expect("no malformed delivery leaves a stray row", stray === 0, `rows ${stray}`);
}

async function draftOnlyR5() {
  const created = await post(
    "/api/channels/webhook/instagram",
    {
      businessId: CLINIC,
      externalMessageId: `${RUN}-r5`,
      customerName: "Clinic Customer",
      customerHandle: "@clinic.customer",
      query: "What are your prices and hours?",
    },
    judgeCookie,
  );
  expect("a DRAFT_ONLY delivery returns 200", created.status === 200, `status ${created.status}`);
  const ticket = parseJson(created.body);
  if (ticket === null) {
    expect("the delivery returns JSON", false, created.body.slice(0, 160));
    return;
  }

  expect("AT/R5: the rule is R5", ticket.routingRuleHit === "R5", String(ticket.routingRuleHit));
  expect("R5 holds the answer as a draft", ticket.actionStatus === "draft", String(ticket.actionStatus));
  expect("R5 never auto-sends", ticket.shouldAutoSend === false, String(ticket.shouldAutoSend));
  expect(
    "the draft is grounded (confidence >= 50 and cited chunks)",
    ticket.confidenceScore >= 50 && Array.isArray(ticket.sources) && ticket.sources.length > 0,
    `confidence ${ticket.confidenceScore}, ${Array.isArray(ticket.sources) ? ticket.sources.length : "no"} sources`,
  );

  const detail = parseJson(
    (await get(`/api/businesses/${CLINIC}/tickets?ticketId=${ticket.ticketId}`, judgeCookie)).body,
  );
  const types = Array.isArray(detail?.events) ? detail.events.map((event) => event.eventType) : [];
  expect("the trail records DRAFT_SAVED", types.includes("DRAFT_SAVED"), types.join(","));
  expect("the trail has no AUTO_SENT", !types.includes("AUTO_SENT"), types.join(","));

  const approved = await patch(
    `/api/businesses/${CLINIC}/tickets`,
    { ticketId: ticket.ticketId, action: "approve_draft" },
    judgeCookie,
  );
  expect("a human can approve the draft", approved.status === 200, `status ${approved.status}`);
  const approval = parseJson(approved.body);
  expect(
    "approving sends it: replied + answered",
    approval?.state === "replied" && approval?.actionStatus === "answered",
    JSON.stringify(approval),
  );

  const after = parseJson(
    (await get(`/api/businesses/${CLINIC}/tickets?ticketId=${ticket.ticketId}`, judgeCookie)).body,
  );
  const afterTypes = Array.isArray(after?.events) ? after.events.map((event) => event.eventType) : [];
  expect(
    "the trail records HUMAN_APPROVED_SEND",
    afterTypes.includes("HUMAN_APPROVED_SEND"),
    afterTypes.join(","),
  );

  const again = await patch(
    `/api/businesses/${CLINIC}/tickets`,
    { ticketId: ticket.ticketId, action: "approve_draft" },
    judgeCookie,
  );
  expect("a second approval is refused with 409", again.status === 409, `status ${again.status}`);
}

async function escalation() {
  const created = await post(
    "/api/channels/webhook/whatsapp",
    {
      businessId: CLINIC,
      externalMessageId: `${RUN}-r1`,
      customerName: "Clinic Customer",
      customerHandle: "+910000000001",
      query: "Let me talk to a real human manager",
    },
    judgeCookie,
  );
  const ticket = parseJson(created.body);
  if (ticket === null) {
    expect("the escalation delivery returns JSON", false, created.body.slice(0, 160));
    return;
  }
  expect("AT/R1: the rule is R1", ticket.routingRuleHit === "R1", String(ticket.routingRuleHit));
  expect("R1 escalates", ticket.actionStatus === "escalated", String(ticket.actionStatus));

  const notApprovable = await patch(
    `/api/businesses/${CLINIC}/tickets`,
    { ticketId: ticket.ticketId, action: "approve_draft" },
    judgeCookie,
  );
  expect(
    "an escalated ticket cannot be approved as a draft",
    notApprovable.status === 409,
    `status ${notApprovable.status}`,
  );

  const resolved = await patch(
    `/api/businesses/${CLINIC}/tickets`,
    { ticketId: ticket.ticketId, action: "resolve" },
    judgeCookie,
  );
  expect("a human can resolve the escalation", resolved.status === 200, `status ${resolved.status}`);
  const resolution = parseJson(resolved.body);
  expect("resolving closes the ticket", resolution?.state === "closed", JSON.stringify(resolution));

  const detail = parseJson(
    (await get(`/api/businesses/${CLINIC}/tickets?ticketId=${ticket.ticketId}`, judgeCookie)).body,
  );
  const types = Array.isArray(detail?.events) ? detail.events.map((event) => event.eventType) : [];
  expect("the trail records HUMAN_RESOLVED", types.includes("HUMAN_RESOLVED"), types.join(","));
}

async function insights() {
  const response = await get(`/api/businesses/${CLINIC}/insights`, judgeCookie);
  expect("GET /insights returns 200", response.status === 200, `status ${response.status}`);
  const report = parseJson(response.body);
  if (report === null) {
    expect("the insights response is JSON", false, response.body.slice(0, 160));
    return;
  }
  expect("insights label a 7-day window", report.windowDays === 7, `windowDays ${report.windowDays}`);
  expect("insights count this run's tickets", report.totalTickets >= 1, `total ${report.totalTickets}`);
  expect(
    "insights carry all four sentiments",
    report.sentiment !== null &&
      ["positive", "neutral", "frustrated", "distressed"].every(
        (key) => typeof report.sentiment[key] === "number",
      ),
    JSON.stringify(report.sentiment),
  );
  expect(
    "insights return a recurring-complaints list",
    Array.isArray(report.recurringComplaints),
    typeof report.recurringComplaints,
  );
}

async function textQuery() {
  const body = {
    businessId: CLOUDPULSE,
    customerName: "Judge Tester",
    customerHandle: "judge@sphinx.mnit.ac.in",
    channel: "TEXT_MODAL",
    query: "What is the price of the Pro Plan and does it include WhatsApp invoicing?",
  };
  const response = await post("/api/ai/text-query", body, judgeCookie);
  expect("POST /api/ai/text-query returns 200", response.status === 200, `status ${response.status}`);
  const answer = parseJson(response.body);
  if (answer === null) {
    expect("the text answer is JSON", false, response.body.slice(0, 160));
    return;
  }
  expect("AT-09: the grounded answer is sent", answer.actionStatus === "answered", String(answer.actionStatus));
  if (typeof answer.ticketId === "string") createdTicketIds.add(answer.ticketId);
  expect(
    "AT-09: the answer cites at least one chunk",
    Array.isArray(answer.sources) && answer.sources.length > 0,
    String(answer.sources?.length),
  );

  const brain = parseJson((await get(`/api/businesses/${CLOUDPULSE}/brain`, judgeCookie)).body);
  const realIds = new Set(
    Array.isArray(brain?.chunks) ? brain.chunks.map((chunk) => chunk.chunkId) : [],
  );
  expect(
    "AT-09: every citation is a real chunk of this business",
    Array.isArray(answer.sources) && answer.sources.every((source) => realIds.has(source.chunkId)),
    JSON.stringify(answer.sources?.map((source) => source.chunkId)),
  );

  const foreign = await post("/api/ai/text-query", { ...body, businessId: RIVAL }, judgeCookie);
  expect(
    "AT-05: the text agent refuses another tenant's businessId (403)",
    foreign.status === 403,
    `status ${foreign.status}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(NEXT_BIN)) {
    process.stderr.write(`next binary not found at ${NEXT_BIN}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `Phase 3 gate — base ${BASE}${EXTERNAL_BASE === null ? "" : " (already running)"}\n`,
  );
  if (EXTERNAL_BASE === null) startServer();

  try {
    await waitForServer();
    await group("auth", auth);
    if (judgeCookie === null) {
      throw new Error("the judge demo could not sign in — every later group depends on it");
    }
    await group("channels state", channelState);
    await group("surface", surface);
    await group("idempotency (AT-10)", idempotency);
    await group("cross-tenant idempotency (AT-05)", crossTenantIdempotency);
    await group("provider token", providerToken);
    await group("webhook tenancy (session path)", webhookTenancy);
    await group("replay race", replayRace);
    await group("malformed payloads", malformedPayloads);
    await group("R5 draft-only", draftOnlyR5);
    await group("escalation + resolve (R1)", escalation);
    await group("insights", insights);
    await group("text query (AT-05, AT-09)", textQuery);
  } finally {
    stopServer();
    await group("cleanup", async () => {
      const problems = await cleanup();
      expect("every gate ticket was removed", problems.length === 0, problems.join("; "));
    });
    logStream.end();
  }

  const failed = results.filter((result) => !result.ok);
  process.stdout.write(
    `\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} checks green\n`,
  );
  process.stdout.write(`server log: ${serverLog}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  stopServer();
  process.stderr.write(`\ngate crashed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

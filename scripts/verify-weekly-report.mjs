#!/usr/bin/env node
/**
 * Weekly insights gate — boots the real app and proves the automatic report over HTTP + the DB.
 *
 * Why a script and not a unit test: the claim is "a completed week produces a persisted report
 * without anyone clicking, and the cron sweep is idempotent and authenticated". That needs the real
 * route handlers, the real Prisma schema and real rows, exactly as a deployment meets them.
 *
 *   node --env-file-if-exists=.env scripts/verify-weekly-report.mjs
 *   VERIFY_PORT=3300 VERIFY_BASE_URL=http://localhost:3000 npm run verify:weekly
 *
 * Isolation: the gate creates its own business id `gate-week-<timestamp>-biz` with its own tickets
 * (createdAt inside the completed ISO week and the week before it), so seeded tickets can never move
 * the expected counts. Cleanup deletes every `gate-week-*` business (children cascade) and the report
 * rows the sweep added to other tenants, including after a crash of an earlier run.
 *
 * Exit code 0 when every check passes, 1 otherwise. The dev server is killed in `finally`.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.VERIFY_PORT ?? 3125);
/** Point at an already-running app when `next dev` already holds the project lock. */
const EXTERNAL_BASE = process.env.VERIFY_BASE_URL ?? null;
const BASE = EXTERNAL_BASE ?? `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BOOT_TIMEOUT_MS = 90_000;

const RUN = `gate-week-${Date.now()}`;
const GATE_BUSINESS = `${RUN}-biz`;
const DEMO_EMAIL = "judge@demo.aftersales.ai";
const CLOUDPULSE = "biz_cloudpulse_01";
/** A spawned server gets a generated secret; an already-running one must have been started with it. */
const CRON_SECRET =
  (process.env.CRON_SECRET ?? "").trim() ||
  (EXTERNAL_BASE === null ? `gate-week-secret-${process.pid}` : "");
/**
 * Turbopack dev loads the route handlers and the page in separate module graphs, so an unset
 * AUTH_SECRET gives each graph its own ephemeral key and the page rejects the route's cookie.
 * A spawned server therefore gets its own signing key; an external one must have AUTH_SECRET set.
 */
const AUTH_SECRET =
  (process.env.AUTH_SECRET ?? "").trim() ||
  (EXTERNAL_BASE === null ? `gate-week-auth-secret-${process.pid}-pad` : "");

const logDir = mkdtempSync(join(tmpdir(), "aftersales-gate-week-"));
const serverLog = join(logDir, "next-dev.log");
const logStream = createWriteStream(serverLog, { flags: "a" });

let server = null;
let db = null;
let judgeCookie = null;
let weeklyModule = null;
/** Report ids that already existed before the cron sweep, so cleanup removes only its additions. */
let preexistingReportIds = null;
/** The lazy-created report's identity, asserted stable across a second read. */
let storedReportId = null;
let storedGeneratedAt = null;
let completedWeekStart = null;
let completedWeekEnd = null;
let nextWeekStart = null;
const results = [];

async function database() {
  if (db === null) db = (await import("../src/server/db.ts")).prisma;
  return db;
}

async function weekly() {
  if (weeklyModule === null) {
    weeklyModule = await import("../src/server/business/weekly-report.ts");
  }
  return weeklyModule;
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

async function get(path, cookie, extraHeaders = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { ...extraHeaders, ...(cookie === undefined ? {} : { cookie }) },
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function post(path, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie !== undefined) headers.cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
    env: {
      ...process.env,
      NODE_ENV: "development",
      LLM_PROVIDER: "heuristic",
      CRON_SECRET,
      AUTH_SECRET,
    },
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
    if (preexistingReportIds !== null) {
      await prisma.weeklyInsightReport.deleteMany({
        where: {
          id: { notIn: [...preexistingReportIds] },
          businessId: { not: GATE_BUSINESS },
        },
      });
    }
    await prisma.business.deleteMany({ where: { id: { startsWith: "gate-week-" } } });
  } catch (error) {
    problems.push(
      `could not delete gate rows: ${error instanceof Error ? error.message : String(error)}`,
    );
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
  judgeCookie = cookie;
}

async function seedGateTenant() {
  const prisma = await database();
  const owner = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  expect("the seeded judge account exists", owner !== null, "run npm run db:seed");
  if (owner === null) return;

  await prisma.business.deleteMany({ where: { id: { startsWith: "gate-week-" } } });
  await prisma.business.create({
    data: {
      id: GATE_BUSINESS,
      ownerId: owner.id,
      name: "Gate Weekly Studio",
      businessType: "services",
      description: "Isolated tenant for the weekly insights gate.",
      productsServices: "Gate-only services",
      hours: "09:00-17:00",
      returnPolicy: "No returns",
      faqs: "[]",
      escalationEmail: "gate@example.test",
      escalationPhone: "+910000000000",
      compiledBrainMd: "# Gate Weekly Studio\n\nThe gate's own tenant.",
    },
  });

  const { weekWindow } = await weekly();
  const now = new Date();
  const completed = weekWindow(now, 1);
  const previous = weekWindow(now, 2);
  completedWeekStart = completed.start.toISOString();
  completedWeekEnd = completed.end.toISOString();
  nextWeekStart = weekWindow(now).end.toISOString();
  const HOUR = 60 * 60 * 1000;
  const at = (window, day) => new Date(window.start.getTime() + day * 24 * HOUR + 10 * HOUR);

  const tickets = [
    {
      suffix: "frustrated",
      intent: "refund_delay",
      sentiment: "frustrated",
      actionStatus: "escalated",
      routingRuleHit: "R3",
      customerQuery: "My refund is three weeks late",
      citedChunkIds: "[]",
      createdAt: at(completed, 0),
    },
    {
      suffix: "distressed",
      intent: "refund_delay",
      sentiment: "distressed",
      actionStatus: "escalated",
      routingRuleHit: "R3",
      customerQuery: "This is unacceptable, I need my money back today",
      citedChunkIds: "[]",
      createdAt: at(completed, 1),
    },
    {
      suffix: "neutral",
      intent: "refund_delay",
      sentiment: "neutral",
      actionStatus: "draft",
      routingRuleHit: "R5",
      customerQuery: "When will my refund arrive?",
      citedChunkIds: "[]",
      createdAt: at(completed, 2),
    },
    {
      suffix: "positive",
      intent: "praise",
      sentiment: "positive",
      actionStatus: "answered",
      routingRuleHit: "R6",
      customerQuery: "The new dashboard is great, thank you",
      citedChunkIds: '["chk_gate_01"]',
      createdAt: at(completed, 3),
    },
    {
      suffix: "prior",
      intent: "refund_delay",
      sentiment: "distressed",
      actionStatus: "escalated",
      routingRuleHit: "R3",
      customerQuery: "Refund still missing",
      citedChunkIds: "[]",
      createdAt: at(previous, 2),
    },
  ];

  for (const ticket of tickets) {
    await prisma.ticket.create({
      data: {
        businessId: GATE_BUSINESS,
        externalMessageId: `${RUN}-${ticket.suffix}`,
        channel: "WHATSAPP",
        customerName: "Gate Customer",
        customerHandle: "+910000000000",
        customerQuery: ticket.customerQuery,
        state: "triaged",
        specialistAssigned: "billing",
        intent: ticket.intent,
        sentiment: ticket.sentiment,
        urgencyScore: 60,
        confidenceScore: 70,
        actionStatus: ticket.actionStatus,
        routingRuleHit: ticket.routingRuleHit,
        aiDraftOrReply: "gate answer",
        citedChunkIds: ticket.citedChunkIds,
        createdAt: ticket.createdAt,
        updatedAt: ticket.createdAt,
      },
    });
  }
  expect("the gate tenant has five backdated tickets", tickets.length === 5, "seeded");
}

async function lazyWeeklyReport() {
  const response = await get(`/api/businesses/${GATE_BUSINESS}/insights`, judgeCookie);
  expect("GET /insights returns 200", response.status === 200, `status ${response.status}`);
  const body = parseJson(response.body);
  expect("the insights response is JSON", body !== null, response.body.slice(0, 160));
  if (body === null) return;

  const report = body.weeklyReport;
  expect(
    "a completed-week report is present",
    report !== null && report !== undefined,
    "weeklyReport is null",
  );
  if (report === null || report === undefined) return;

  expect(
    "the report is aligned to the completed ISO week",
    report.weekStart === completedWeekStart && report.weekEnd === completedWeekEnd,
    `${report.weekStart} → ${report.weekEnd} (expected ${completedWeekStart} → ${completedWeekEnd})`,
  );
  expect("four tickets are counted", report.totalTickets === 4, `total ${report.totalTickets}`);
  expect("the sentiment index is the weighted 43", report.sentimentScore === 43, String(report.sentimentScore));
  expect("the previous week's index is carried", report.previousScore === 0, String(report.previousScore));
  expect("the trend is improving", report.sentimentTrend === "improving", String(report.sentimentTrend));
  expect(
    "the daily series has seven days that sum to the week",
    Array.isArray(report.dailySentiment) &&
      report.dailySentiment.length === 7 &&
      report.dailySentiment.reduce((sum, day) => sum + day.total, 0) === 4,
    JSON.stringify(report.dailySentiment),
  );
  const complaint = Array.isArray(report.recurringComplaints)
    ? report.recurringComplaints[0]
    : null;
  expect(
    "refund_delay is the top recurring complaint with 3 tickets, 2 negative",
    complaint?.intent === "refund_delay" &&
      complaint?.count === 3 &&
      complaint?.negative === 2 &&
      complaint?.negativeShare === 67,
    JSON.stringify(complaint),
  );
  expect(
    "it carries the week-over-week delta (1 → 3, rising)",
    complaint?.previousCount === 1 && complaint?.delta === 2 && complaint?.direction === "rising",
    JSON.stringify(complaint),
  );
  expect("the trigger records the lazy automatic path", report.trigger === "lazy", String(report.trigger));
  expect(
    "the live sentiment tracker is in the same response",
    typeof body.sentimentScore === "number" && Array.isArray(body.dailySentiment),
    JSON.stringify({ score: body.sentimentScore, daily: typeof body.dailySentiment }),
  );
  expect(
    "nextReportAt points at the next Monday",
    body.nextReportAt === nextWeekStart,
    `${body.nextReportAt}`,
  );

  const prisma = await database();
  const rows = await prisma.weeklyInsightReport.findMany({
    where: { businessId: GATE_BUSINESS },
  });
  expect("exactly one report row was persisted", rows.length === 1, `rows ${rows.length}`);
  expect(
    "the persisted row uses the completed weekStart",
    rows[0]?.weekStart.toISOString() === completedWeekStart,
    `${rows[0]?.weekStart?.toISOString()}`,
  );
  storedReportId = rows[0]?.id ?? null;
  storedGeneratedAt = rows[0]?.generatedAt.toISOString() ?? null;
}

async function idempotentRead() {
  const first = parseJson(
    (await get(`/api/businesses/${GATE_BUSINESS}/insights`, judgeCookie)).body,
  );
  const second = parseJson(
    (await get(`/api/businesses/${GATE_BUSINESS}/insights`, judgeCookie)).body,
  );
  expect("the report survives a second read", second?.weeklyReport?.weekStart === completedWeekStart, "missing");

  const prisma = await database();
  const rows = await prisma.weeklyInsightReport.findMany({
    where: { businessId: GATE_BUSINESS },
  });
  expect("the second read does not duplicate the row", rows.length === 1, `rows ${rows.length}`);
  expect("the row id is unchanged", rows[0]?.id === storedReportId, `${rows[0]?.id}`);
  expect(
    "generatedAt does not move on a read",
    rows[0]?.generatedAt.toISOString() === storedGeneratedAt,
    `${rows[0]?.generatedAt.toISOString()} vs ${storedGeneratedAt}`,
  );
  expect(
    "weeklyHistory contains the latest report",
    Array.isArray(second?.weeklyHistory) &&
      second.weeklyHistory.some((view) => view.weekStart === completedWeekStart),
    JSON.stringify(second?.weeklyHistory?.map((view) => view.weekStart)),
  );
  expect(
    "the first response already had the same report",
    first?.weeklyReport?.sentimentScore === second?.weeklyReport?.sentimentScore,
    "responses disagree",
  );
}

async function cronSweep() {
  const prisma = await database();
  const before = await prisma.weeklyInsightReport.findMany({ select: { id: true } });
  preexistingReportIds = new Set(before.map((row) => row.id));

  const anonymous = await get("/api/cron/weekly-insights");
  expect("cron without a secret is rejected (401)", anonymous.status === 401, `status ${anonymous.status}`);

  const wrongSecret = await get("/api/cron/weekly-insights", undefined, {
    authorization: "Bearer definitely-not-the-secret",
  });
  expect("cron with a wrong secret is rejected (401)", wrongSecret.status === 401, `status ${wrongSecret.status}`);

  if (CRON_SECRET === "") {
    expect("a cron secret is available for the authorised call", false, "set CRON_SECRET or run a spawned server");
    return;
  }

  const authorised = await get("/api/cron/weekly-insights", undefined, {
    authorization: `Bearer ${CRON_SECRET}`,
  });
  expect("cron with the secret returns 200", authorised.status === 200, `status ${authorised.status}`);
  const sweep = parseJson(authorised.body);
  expect("the sweep is JSON", sweep !== null, authorised.body.slice(0, 160));
  if (sweep === null) return;

  expect("the sweep names the completed week", sweep.weekStart === completedWeekStart, `${sweep.weekStart}`);
  expect("the sweep created at least one report", sweep.created >= 1, `created ${sweep.created}`);
  expect(
    "no business failed during the sweep",
    Array.isArray(sweep.failures) && sweep.failures.length === 0,
    JSON.stringify(sweep.failures),
  );

  const seeded = await prisma.weeklyInsightReport.findUnique({
    where: {
      businessId_weekStart: {
        businessId: CLOUDPULSE,
        weekStart: new Date(completedWeekStart),
      },
    },
  });
  expect("a seeded business now has a persisted report", seeded !== null, "missing");
  expect("the cron-created report records the cron trigger", seeded?.trigger === "cron", `${seeded?.trigger}`);

  const second = await get("/api/cron/weekly-insights", undefined, {
    authorization: `Bearer ${CRON_SECRET}`,
  });
  const secondSweep = parseJson(second.body);
  expect("a second sweep is idempotent (created 0)", secondSweep?.created === 0, `created ${secondSweep?.created}`);
  expect("the gate report itself was not regenerated", secondSweep?.existing >= 1, `existing ${secondSweep?.existing}`);
}

async function dashboardSurface() {
  const response = await get(`/dashboard?tab=brain&business=${GATE_BUSINESS}`, judgeCookie);
  expect("GET /dashboard?tab=brain returns 200", response.status === 200, `status ${response.status}`);
  expectIncludes(response.body, "Automatic weekly report");
  expectIncludes(response.body, "Sentiment trend");
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
    `Weekly insights gate — base ${BASE}${EXTERNAL_BASE === null ? "" : " (already running)"}\n`,
  );
  if (EXTERNAL_BASE === null) startServer();

  try {
    await waitForServer();
    await group("auth", auth);
    if (judgeCookie === null) {
      throw new Error("the judge demo could not sign in — every later group depends on it");
    }
    await group("seed the gate tenant", seedGateTenant);
    await group("lazy automatic report", lazyWeeklyReport);
    await group("idempotent read", idempotentRead);
    await group("cron sweep", cronSweep);
    await group("dashboard surface", dashboardSurface);
  } finally {
    stopServer();
    await group("cleanup", async () => {
      const problems = await cleanup();
      expect("every gate row was removed", problems.length === 0, problems.join("; "));
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

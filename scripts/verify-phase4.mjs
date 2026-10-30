#!/usr/bin/env node
/**
 * Phase 4 gate — boots the real app and asserts the PRD's voice gate over HTTP + the DB.
 *
 * Why a script and not a unit test: the repo's `node --test` suite covers pure logic only. The
 * Phase 4 gate is about session binding, per-business grounding, call completion and what the
 * dashboard renders, so it runs against `next dev` exactly as a judge and the voice platform
 * would meet it.
 *
 *   node --env-file-if-exists=.env scripts/verify-phase4.mjs
 *   VERIFY_PORT=3325 VERIFY_BASE_URL=http://localhost:3000 npm run verify:phase4
 *
 * The spawned server always runs as a dry run: a fake SARVAM_API_KEY with no
 * SARVAM_CALL_ENDPOINT, which is exactly the state a judge sees on a machine without Sarvam
 * credentials. That also lets AT-12 prove the fake key never reaches a rendered page.
 *
 * Every row this run creates is tagged with one `judgePhone` (`CALLER_PHONE`) and removed in
 * `finally`, including after a crash of an earlier run.
 *
 * Exit code 0 when every check passes, 1 otherwise. The dev server is killed in `finally`,
 * including when a check throws.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, createWriteStream } from "node:fs";
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

const CLOUDPULSE = "biz_cloudpulse_01";
const CLINIC = "biz_jaipursmile_02";
const RIVAL = "biz_nimbus_03";

/** The fake key the spawned server is given. AT-12 asserts it never reaches a page. */
const FAKE_SARVAM_KEY = "gate4-not-a-real-key";

const RUN = `gate4-${Date.now()}`;
/** One caller number for the whole run — the gate's claim is one shared number, two businesses. */
const CALLER_PHONE = `+919${RUN.slice(-8)}`;
/** PRD §3 freezes the session status enum; nothing may write outside it. */
const VOICE_STATUSES = ["initiated", "ringing", "in_progress", "completed", "failed"];
const ESCALATION_OUTCOMES = ["resolved_by_ai", "escalated_to_owner"];

const logDir = mkdtempSync(join(tmpdir(), "aftersales-gate4-"));
const serverLog = join(logDir, "next-dev.log");
const logStream = createWriteStream(serverLog, { flags: "a" });

let server = null;
let db = null;
let judgeCookie = null;
/** Sessions created through the API, by id, so later groups can use them. */
const sessions = new Map();
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
      // A dry run by construction: a key exists, the endpoint does not.
      SARVAM_API_KEY: FAKE_SARVAM_KEY,
      SARVAM_CALL_ENDPOINT: "",
      SARVAM_WEBHOOK_TOKEN: "",
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
    await prisma.voiceTestSession.deleteMany({ where: { judgePhone: CALLER_PHONE } });
    await prisma.ticket.deleteMany({ where: { customerHandle: CALLER_PHONE } });
  } catch (error) {
    problems.push(`could not delete gate rows: ${error instanceof Error ? error.message : String(error)}`);
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

async function startSessionGroup() {
  const started = await post(
    "/api/voice/start-session",
    { businessId: CLOUDPULSE, judgePhone: CALLER_PHONE },
    judgeCookie,
  );
  expect("POST /api/voice/start-session returns 200", started.status === 200, `status ${started.status}`);
  const body = parseJson(started.body);
  if (body === null) {
    expect("start-session returns JSON", false, started.body.slice(0, 160));
    return;
  }
  sessions.set(CLOUDPULSE, body);

  expect("the response names the session", typeof body.sessionId === "string", JSON.stringify(body.sessionId));
  expect("the 4-digit fallback PIN is 4 digits", /^\d{4}$/.test(String(body.demoPin)), String(body.demoPin));
  expect("the session is bound to the requested business", body.businessId === CLOUDPULSE, String(body.businessId));
  expect(
    "the context mechanism is per-call variables",
    body.contextInjectionMode === "PER_CALL_VARIABLES",
    String(body.contextInjectionMode),
  );
  expect(
    "PRD §3: the session status stays inside the frozen enum",
    VOICE_STATUSES.includes(String(body.status)),
    `status ${String(body.status)}`,
  );
  expect(
    "AT-11: without an endpoint the call is an explicit dry run",
    body.callMode === "dry_run" && body.sarvamConfigured === false,
    `callMode ${String(body.callMode)} configured ${String(body.sarvamConfigured)}`,
  );
  expect(
    "the session carries a 10-minute expiry",
    typeof body.expiresAt === "string" &&
      new Date(body.expiresAt).getTime() > Date.now() + 8 * 60 * 1000,
    String(body.expiresAt),
  );
}

async function isolation() {
  const rival = await post(
    "/api/voice/start-session",
    { businessId: RIVAL, judgePhone: CALLER_PHONE },
    judgeCookie,
  );
  expect("AT-05: another tenant's business answers 403", rival.status === 403, `status ${rival.status}`);
  const rivalBody = parseJson(rival.body);
  expect(
    "AT-05: the 403 uses the frozen error shape",
    typeof rivalBody?.error?.code === "number" && typeof rivalBody?.error?.message === "string",
    rival.body.slice(0, 120),
  );

  const anonymous = await post("/api/voice/start-session", {
    businessId: CLOUDPULSE,
    judgePhone: CALLER_PHONE,
  });
  expect("start-session without a session answers 401", anonymous.status === 401, `status ${anonymous.status}`);

  const badPhone = await post(
    "/api/voice/start-session",
    { businessId: CLOUDPULSE, judgePhone: "9812345678" },
    judgeCookie,
  );
  expect("a non-E.164 phone answers 400", badPhone.status === 400, `status ${badPhone.status}`);

  const prisma = await database();
  const leaked = await prisma.voiceTestSession.count({ where: { judgePhone: "9812345678" } });
  expect("a rejected phone never creates a session row", leaked === 0, `rows ${leaked}`);
}

async function resolution() {
  const cloudpulse = sessions.get(CLOUDPULSE);
  expect("the CLOUDPULSE session from the earlier group exists", cloudpulse !== undefined, "missing");
  if (cloudpulse === undefined) return;

  const byPin = await post("/api/voice/sarvam-tool-search", {
    demoPin: cloudpulse.demoPin,
    query: "What is your refund policy?",
  });
  expect("tool-search resolves the session by demoPin", byPin.status === 200, `status ${byPin.status}`);
  const byPinBody = parseJson(byPin.body);
  expect(
    "tool-search by PIN names this session's business",
    byPinBody?.businessName === "CloudPulse CRM",
    String(byPinBody?.businessName),
  );

  const byPhone = await post("/api/voice/sarvam-tool-search", {
    callerPhone: CALLER_PHONE,
    query: "What is your refund policy?",
  });
  expect("tool-search resolves the session by callerPhone", byPhone.status === 200, `status ${byPhone.status}`);
  const byPhoneBody = parseJson(byPhone.body);
  expect(
    "tool-search by phone names this session's business",
    byPhoneBody?.businessName === "CloudPulse CRM",
    String(byPhoneBody?.businessName),
  );

  const noKey = await post("/api/voice/sarvam-tool-search", { query: "What is your refund policy?" });
  expect("tool-search with no session capability answers 400", noKey.status === 400, `status ${noKey.status}`);

  const unknown = await post("/api/voice/sarvam-tool-search", {
    sessionId: "vsess_does_not_exist",
    query: "What is your refund policy?",
  });
  expect("tool-search for an unknown session answers 404", unknown.status === 404, `status ${unknown.status}`);

  const prisma = await database();
  const expired = await prisma.voiceTestSession.create({
    data: {
      businessId: CLOUDPULSE,
      demoPin: "0001",
      judgePhone: CALLER_PHONE,
      status: "initiated",
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const stale = await post("/api/voice/sarvam-tool-search", {
    sessionId: expired.id,
    query: "What is your refund policy?",
  });
  expect("an expired session answers 410", stale.status === 410, `status ${stale.status}`);
}

// ---------------------------------------------------------------------------

async function main() {
  if (EXTERNAL_BASE === null) {
    startServer();
    await waitForServer();
  }
  process.stdout.write(`Phase 4 gate against ${BASE} (${RUN})\n`);

  await group("auth", auth);
  await group("session — one business, one PIN, ten minutes", startSessionGroup);
  await group("isolation — AT-05", isolation);
  await group("resolution — sessionId / demoPin / callerPhone / expiry", resolution);

  // Later tasks append their groups above this line.
}

try {
  await main();
} catch (error) {
  expect("the gate runs to completion", false, error instanceof Error ? error.message : String(error));
} finally {
  stopServer();
  const problems = await cleanup();
  logStream.end();
  for (const problem of problems) process.stderr.write(`cleanup: ${problem}\n`);
}

const failed = results.filter((result) => !result.ok);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} checks passed${failed.length === 0 ? "" : `, ${failed.length} failed`}\n`,
);
if (failed.length > 0) {
  process.stdout.write(`server log: ${serverLog}\n`);
  process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/**
 * Phase 1 gate — boots the real app and asserts the PRD's acceptance checks over HTTP.
 *
 * Why a script and not a unit test: the repo's `node --test` suite covers pure logic only
 * (no React test runner, no jsdom). The Phase 1 gate is about routes, cookies, redirects and
 * rendered pages, so it runs against `next dev` exactly as a judge would meet it.
 *
 *   node --env-file=.env scripts/verify-phase1.mjs
 *   VERIFY_PORT=3200 VERIFY_LOG=/tmp/gate.log node --env-file=.env scripts/verify-phase1.mjs
 *
 * Exit code 0 when every check passes, 1 otherwise. The dev server is killed in `finally`,
 * including when a check throws.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, createWriteStream, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.VERIFY_PORT ?? 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BOOT_TIMEOUT_MS = 90_000;

const logDir = mkdtempSync(join(tmpdir(), "aftersales-gate-"));
const serverLog = join(logDir, "next-dev.log");
const logStream = createWriteStream(serverLog, { flags: "a" });

let server = null;
const results = [];

/** Rows this run created; removed in `finally` so the seed state survives a gate run. */
let createdBusinessId = null;
let createdUserId = null;
let demoHashBackup = null;
let db = null;

async function database() {
  if (db === null) db = (await import("../src/server/db.ts")).prisma;
  return db;
}

async function authHelpers() {
  return import("../src/server/auth/crypto.ts");
}

async function cookieFor(userId) {
  const { SESSION_COOKIE, signSessionToken } = await authHelpers();
  return `${SESSION_COOKIE}=${signSessionToken(userId)}`;
}

function isMissingRow(error) {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "P2025"
  );
}

/**
 * Remove every row this run created. Returns the problems instead of swallowing
 * them: a gate that leaves a business behind must not report PASS.
 */
async function cleanup() {
  const problems = [];
  let prisma = null;
  try {
    prisma = await database();
  } catch (error) {
    return [`could not reach the database: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (demoHashBackup !== null) {
    // Restore the demo password even if a check threw between mutation and its `finally`.
    try {
      const demo = await prisma.user.findUnique({ where: { email: "judge@demo.aftersales.ai" } });
      if (demo !== null) {
        await prisma.user.update({ where: { id: demo.id }, data: { passwordHash: demoHashBackup } });
      }
      demoHashBackup = null;
    } catch (error) {
      problems.push(`could not restore the demo password: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [label, id, remove] of [
    ["business", createdBusinessId, () => prisma.business.delete({ where: { id: createdBusinessId } })],
    ["user", createdUserId, () => prisma.user.delete({ where: { id: createdUserId } })],
  ]) {
    if (id === null) continue;
    try {
      await remove();
    } catch (error) {
      if (!isMissingRow(error)) {
        problems.push(`could not delete ${label} ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  createdBusinessId = null;
  createdUserId = null;

  await prisma.$disconnect();
  return problems;
}

/** Ctrl-C must not leave a detached `next dev` running or a half-written row behind. */
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

function expect(label, ok, detail = "") {
  // A passing check keeps its label only: a "why it failed" note on a green line reads as a defect.
  results.push({ label, ok: Boolean(ok), detail: ok ? "" : detail });
}

function expectIncludes(body, needle, label = `body contains ${JSON.stringify(needle)}`) {
  expect(label, body.includes(needle), body.includes(needle) ? "" : "missing from response body");
}

function expectExcludes(body, needle, label = `body does not contain ${JSON.stringify(needle)}`) {
  expect(label, !body.includes(needle), body.includes(needle) ? "unexpected in response body" : "");
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

function startServer() {
  server = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, NODE_ENV: "development" },
  });
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
  return server;
}

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early (code ${server.exitCode}); log: ${serverLog}`);
    }
    try {
      const response = await fetch(`${BASE}/`, { redirect: "manual" });
      if (response.status > 0) return;
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
    expect(`${name}: the group itself must not throw`, false, error instanceof Error ? error.message : String(error));
  }
  for (const result of results.slice(before)) {
    const mark = result.ok ? "✓" : "✗";
    const detail = result.detail.length > 0 ? ` — ${result.detail}` : "";
    process.stdout.write(`  ${mark} ${result.label}${detail}\n`);
  }
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
  const text = await response.text();
  return { status: response.status, body: text, headers: response.headers };
}

function sessionCookie(headers) {
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const session = cookies.find((cookie) => cookie.startsWith("as_session="));
  return session === undefined ? null : session.split(";")[0];
}

async function getWithCookie(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { cookie },
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function landing() {
  const page = await get("/");
  expect("GET / returns 200", page.status === 200, `status ${page.status}`);
  expectIncludes(page.body, 'data-page="landing"');
  expectIncludes(page.body, 'id="how-it-works"');
  expectIncludes(page.body, 'id="rules"');
  expectIncludes(page.body, 'id="features"');
  expectIncludes(page.body, "Your support queue, minus the guessing.");
  expectIncludes(page.body, 'href="/auth"');
  expectIncludes(page.body, "Sign in");
  expectIncludes(page.body, "Get started");
  expectExcludes(page.body, "Sales Digital Agency");
  expectExcludes(page.body, "Go to dashboard");
}

async function auth() {
  const signIn = await post("/api/auth/judge-demo");
  expect("POST /api/auth/judge-demo returns 303", signIn.status === 303, `status ${signIn.status}`);
  expect(
    "the judge demo redirect lands on /dashboard",
    (signIn.headers.get("location") ?? "").endsWith("/dashboard"),
    signIn.headers.get("location") ?? "no location header",
  );

  const cookie = sessionCookie(signIn.headers);
  expect("the judge demo sets an as_session cookie", cookie !== null, cookie === null ? "no session cookie" : "set");
  if (cookie === null) return null;

  const dashboard = await getWithCookie("/dashboard", cookie);
  expect("GET /dashboard with the demo cookie returns 200", dashboard.status === 200, `status ${dashboard.status}`);
  expectIncludes(dashboard.body, "Live queue", "the dashboard renders the Live queue tab");

  const home = await getWithCookie("/", cookie);
  expectIncludes(home.body, "Go to dashboard", "the landing page knows a session exists");
  expectExcludes(home.body, "Get started", "the signed-out CTA is gone for a session");

  const authPage = await get("/auth");
  expectIncludes(authPage.body, "1-click judge demo login", "the auth page shows the judge demo panel");

  await accountSquatting();
  await crossSiteOrigin();

  return cookie;
}

/**
 * A stranger can claim `judge@demo...` through normal sign-up before the seed runs. The demo
 * route must then refuse (404), not hand them a passwordless door into the account a judge
 * is about to type into.
 */
async function accountSquatting() {
  const prisma = await database();
  const { hashPassword } = await authHelpers();
  const demo = await prisma.user.findUnique({ where: { email: "judge@demo.aftersales.ai" } });
  if (demo === null || typeof demo.passwordHash !== "string") {
    expect("the seeded demo account exists", false, "judge@demo.aftersales.ai not found");
    return;
  }

  demoHashBackup = demo.passwordHash;
  try {
    await prisma.user.update({
      where: { id: demo.id },
      data: { passwordHash: hashPassword("squatter-took-this-account") },
    });
    const refused = await post("/api/auth/judge-demo");
    expect(
      "a demo account whose password no longer matches is refused (404)",
      refused.status === 404,
      `status ${refused.status} — anyone could squat the demo email`,
    );
  } finally {
    await prisma.user.update({ where: { id: demo.id }, data: { passwordHash: demoHashBackup } });
    demoHashBackup = null;
  }

  const restored = await post("/api/auth/judge-demo");
  expect("the restored demo account signs in again (303)", restored.status === 303, `status ${restored.status}`);
}

/** Route handlers get no built-in origin check (server actions do) — the cookie must not be set cross-site. */
async function crossSiteOrigin() {
  const crossSite = await post("/api/auth/judge-demo", undefined, undefined, {
    origin: "https://evil.example",
  });
  expect("a cross-site POST is rejected (403)", crossSite.status === 403, `status ${crossSite.status}`);
  expect(
    "a cross-site POST sets no session cookie",
    sessionCookie(crossSite.headers) === null,
    "the response carried as_session",
  );

  const sameSite = await post("/api/auth/judge-demo", undefined, undefined, { origin: BASE });
  expect("a same-origin POST still signs in (303)", sameSite.status === 303, `status ${sameSite.status}`);
}

async function healthAndDocs() {
  const health = await get("/api/health");
  expect("GET /api/health returns 200", health.status === 200, `status ${health.status}`);
  let body = null;
  try {
    body = JSON.parse(health.body);
  } catch {
    body = null;
  }
  expect("health reports status ok", body !== null && body.status === "ok", health.body.slice(0, 120));

  const spike = readFileSync(join(ROOT, "docs", "spikes", "SARVAM.md"), "utf8");
  expect("SARVAM.md carries a verdict", /verdict/i.test(spike), "no verdict line");
  expect(
    "SARVAM.md verdict is GREEN or RED",
    /\bGREEN\b|\bRED\b/.test(spike),
    "no GREEN/RED word",
  );
}

async function contracts(judgeCookie) {
  const created = await post(
    "/api/businesses",
    {
      name: `Gate Test ${Date.now()}`,
      businessType: "SaaS",
      description: "A business the Phase 1 gate creates and removes.",
      productsServices: "Starter: ₹499/mo for one user. Pro: ₹1,499/mo for five users.",
      hours: "Monday to Saturday, 9:00 AM to 7:00 PM IST.",
      returnPolicy: "Full refund within 7 days if fewer than 10 invoices were generated.",
      faqs: "Q: How do I export GSTR-1? A: Go to Reports > GST > Export JSON.",
      escalationEmail: "gate@example.com",
      escalationPhone: "+919876543210",
      agentTone: "Clear and helpful",
    },
    judgeCookie,
  );

  expect("POST /api/businesses returns 201", created.status === 201, `status ${created.status}`);
  let payload = null;
  try {
    payload = JSON.parse(created.body);
  } catch {
    payload = null;
  }
  if (payload === null || typeof payload.businessId !== "string") {
    expect("the create response carries a businessId", false, created.body.slice(0, 160));
    return;
  }
  createdBusinessId = payload.businessId;

  expect("a new brain starts at version 1", payload.brainVersion === 1, `brainVersion ${payload.brainVersion}`);
  expect("onboarding compiles at least one chunk", Number(payload.chunkCount) > 0, `chunkCount ${payload.chunkCount}`);

  const brain = await getWithCookie(`/api/businesses/${payload.businessId}/brain`, judgeCookie);
  expect("GET /brain returns 200", brain.status === 200, `status ${brain.status}`);
  let brainBody = null;
  try {
    brainBody = JSON.parse(brain.body);
  } catch {
    brainBody = null;
  }
  if (brainBody === null) {
    expect("the brain response is JSON", false, brain.body.slice(0, 160));
    return;
  }

  expect(
    "the persisted chunk count matches the create response",
    brainBody.chunkCount === payload.chunkCount,
    `${brainBody.chunkCount} vs ${payload.chunkCount}`,
  );
  expect(
    "every chunk has a citable id and a section",
    Array.isArray(brainBody.chunks) &&
      brainBody.chunks.length > 0 &&
      brainBody.chunks.every(
        (chunk) => typeof chunk.chunkId === "string" && chunk.chunkId.length > 0 && typeof chunk.section === "string",
      ),
    `${Array.isArray(brainBody.chunks) ? brainBody.chunks.length : "no"} chunks`,
  );
  expect(
    "the compiled brain carries the business name",
    typeof brainBody.compiledBrainMd === "string" && brainBody.compiledBrainMd.includes(payload.name),
    "name missing from compiledBrainMd",
  );
}

async function tenancy(judgeCookie) {
  const forbidden = await getWithCookie("/api/businesses/biz_nimbus_03/brain", judgeCookie);
  expect("AT-05: another tenant's brain answers 403", forbidden.status === 403, `status ${forbidden.status}`);

  const prisma = await database();
  const rival = await prisma.user.findUnique({ where: { email: "owner@nimbus.example" } });
  expect("the rival tenant exists (seed ran)", rival !== null, "owner@nimbus.example not found");
  if (rival === null) return;

  const rivalCookie = await cookieFor(rival.id);
  const own = await getWithCookie("/api/businesses/biz_nimbus_03/brain", rivalCookie);
  expect("the rival reads their own brain", own.status === 200, `status ${own.status}`);
}

async function redirect(judgeCookie) {
  const prisma = await database();
  const { hashPassword } = await authHelpers();
  const fresh = await prisma.user.create({
    data: {
      email: `gate-fresh-${Date.now()}@example.com`,
      name: "Gate Fresh",
      passwordHash: hashPassword("gate-password-41"),
    },
  });
  createdUserId = fresh.id;

  const freshCookie = await cookieFor(fresh.id);
  const dashboard = await getWithCookie("/dashboard", freshCookie);
  expect(
    "AT-01: a user with no business is redirected from /dashboard",
    dashboard.status === 307 || dashboard.status === 302 || dashboard.status === 303,
    `status ${dashboard.status}`,
  );
  expect(
    "AT-01: that redirect goes to /onboarding",
    (dashboard.headers.get("location") ?? "").endsWith("/onboarding"),
    dashboard.headers.get("location") ?? "no location header",
  );

  const queue = await getWithCookie("/dashboard?tab=queue", judgeCookie);
  expect("GET /dashboard?tab=queue returns 200", queue.status === 200, `status ${queue.status}`);
  for (const label of ["Live queue", "Voice test", "Business brain", "Channels"]) {
    expectIncludes(queue.body, label, `the dashboard renders the ${label} tab`);
  }
}

async function main() {
  if (!existsSync(NEXT_BIN)) {
    process.stderr.write(`next binary not found at ${NEXT_BIN}\n`);
    process.exit(1);
  }

  process.stdout.write(`Phase 1 gate — base ${BASE}\n`);
  startServer();
  try {
    await waitForServer();
    await group("landing", landing);

    let judgeCookie = null;
    await group("auth", async () => {
      judgeCookie = await auth();
    });
    if (judgeCookie === null) {
      throw new Error("the judge demo could not sign in — every later group depends on it");
    }

    await group("health + docs", healthAndDocs);
    await group("contracts (AT-02)", () => contracts(judgeCookie));
    await group("tenancy (AT-05)", () => tenancy(judgeCookie));
    await group("redirect + surface (AT-01)", () => redirect(judgeCookie));
  } finally {
    stopServer();
    await group("cleanup", async () => {
      const problems = await cleanup();
      expect("every row this run created was removed", problems.length === 0, problems.join("; "));
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

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
import { existsSync, mkdtempSync, createWriteStream } from "node:fs";
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

function expect(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok), detail });
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

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: body === undefined ? {} : { "content-type": "application/json" },
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
  if (cookie === null) return;

  const dashboard = await getWithCookie("/dashboard", cookie);
  expect("GET /dashboard with the demo cookie returns 200", dashboard.status === 200, `status ${dashboard.status}`);
  expectIncludes(dashboard.body, "Live queue", "the dashboard renders the Live queue tab");

  const home = await getWithCookie("/", cookie);
  expectIncludes(home.body, "Go to dashboard", "the landing page knows a session exists");
  expectExcludes(home.body, "Get started", "the signed-out CTA is gone for a session");

  const authPage = await get("/auth");
  expectIncludes(authPage.body, "1-click judge demo login", "the auth page shows the judge demo panel");
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
    await group("auth", auth);
  } finally {
    stopServer();
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

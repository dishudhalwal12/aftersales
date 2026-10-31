#!/usr/bin/env node
/**
 * One-time setup for a fresh clone: the two local services' dependencies and the three
 * `.env` files that let them talk to the app.
 *
 *   npm run setup            everything
 *   npm run setup -- --deps  dependencies only (this is what `npm install` runs)
 *   npm run setup -- --env-only
 *
 * It is idempotent and never overwrites a value a human set. It also never fails
 * `npm install`: a machine without Python or without Apple silicon gets a truthful
 * line and a working app, because both services are optional at runtime.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { commentOutKeys, ensureEnvValues, readEnvValues } from "./lib/env-file.mjs";
import {
  BAILEYS_DIR,
  LAYA_DIR,
  ROOT,
  baileysPrepared,
  findFreePort,
  hasCommand,
  layaPrepared,
  layaSupported,
  run,
} from "./lib/services.mjs";
import { DEFAULT_PORTS, MIN_BAILEYS_SECRET, generateSecret } from "./lib/stack-plan.mjs";

const args = new Set(process.argv.slice(2));
const dependenciesOnly = args.has("--deps");
const envOnly = args.has("--env-only");
const quiet = args.has("--quiet");

const say = (line = "") => {
  if (!quiet) console.log(line);
};
const step = (title) => say(`\n${title}`);
const ok = (line) => say(`  ✓ ${line}`);
const note = (line) => say(`  · ${line}`);
const warn = (line) => say(`  ! ${line}`);

// `npm install` on a build machine must not try to build a WhatsApp bridge or a venv.
if (dependenciesOnly && (process.env.VERCEL || process.env.CI) && !process.env.SERVICE_SETUP_FORCE) {
  if (!quiet) console.log("setup: skipped on CI/Vercel (SERVICE_SETUP_FORCE=1 to run anyway)");
  process.exit(0);
}

const ROOT_ENV = path.join(ROOT, ".env");
const LAYA_ENV = path.join(LAYA_DIR, ".env");
const BAILEYS_ENV = path.join(BAILEYS_DIR, ".env");

const rootUrl = (port) => `http://127.0.0.1:${port}`;

/** Create `<dir>/.env` from its example, with the placeholder values commented out. */
function seedEnvFile(target, example, placeholderKeys) {
  if (existsSync(target)) return false;
  if (!existsSync(example)) return false;
  const body = commentOutKeys(readFileSync(example, "utf8"), placeholderKeys);
  writeFileSync(target, body, "utf8");
  return true;
}

function envPhase() {
  step("1. Environment files");

  const createdRoot = seedEnvFile(ROOT_ENV, path.join(ROOT, ".env.example"), [
    "DATABASE_URL",
    "DIRECT_URL",
  ]);
  const createdLaya = seedEnvFile(LAYA_ENV, path.join(LAYA_DIR, ".env.example"), [
    "LAYA_SERVICE_SECRET",
  ]);
  const createdBaileys = seedEnvFile(BAILEYS_ENV, path.join(BAILEYS_DIR, ".env.example"), [
    "BAILEYS_SERVICE_SECRET",
    "VERCEL_BACKEND_URL",
  ]);

  for (const [created, label] of [
    [createdRoot, ".env"],
    [createdLaya, "laya-service/.env"],
    [createdBaileys, "baileys-service/.env"],
  ]) {
    if (created) ok(`created ${label} from its example`);
  }

  const root = readEnvValues(ROOT_ENV);
  const laya = readEnvValues(LAYA_ENV);
  const baileys = readEnvValues(BAILEYS_ENV);

  const longEnough = (value) => typeof value === "string" && value.length >= MIN_BAILEYS_SECRET;

  // One secret per pair, decided once. An existing value on either side wins; only when
  // neither side has one is a new secret generated.
  const layaSecret =
    (root.get("LAYA_SERVICE_SECRET") ?? "").trim() ||
    (laya.get("LAYA_SERVICE_SECRET") ?? "").trim() ||
    generateSecret();
  const baileysSecret =
    (longEnough((root.get("BAILEYS_SERVICE_SECRET") ?? "").trim())
      ? (root.get("BAILEYS_SERVICE_SECRET") ?? "").trim()
      : "") ||
    (longEnough((baileys.get("BAILEYS_SERVICE_SECRET") ?? "").trim())
      ? (baileys.get("BAILEYS_SERVICE_SECRET") ?? "").trim()
      : "") ||
    generateSecret();

  const layaFilled = ensureEnvValues(
    LAYA_ENV,
    {
      LAYA_HOST: "127.0.0.1",
      LAYA_PORT: String(DEFAULT_PORTS.laya),
      LAYA_SERVICE_SECRET: layaSecret,
      LAYA_MODEL: "aac6fef/laya-typed-decisions-mlx",
    },
    { header: "Written by `npm run setup` for local development." },
  );

  const baileysFilled = ensureEnvValues(
    BAILEYS_ENV,
    {
      PORT: String(DEFAULT_PORTS.baileys),
      BAILEYS_SERVICE_SECRET: baileysSecret,
      VERCEL_BACKEND_URL: rootUrl(DEFAULT_PORTS.web),
      SESSION_STORAGE_PATH: "./sessions",
    },
    { header: "Written by `npm run setup` for local development." },
  );

  const rootFilled = ensureEnvValues(
    ROOT_ENV,
    {
      AUTH_SECRET: generateSecret(),
      LAYA_SERVICE_URL: rootUrl(DEFAULT_PORTS.laya),
      LAYA_SERVICE_SECRET: layaSecret,
      BAILEYS_SERVICE_URL: rootUrl(DEFAULT_PORTS.baileys),
      BAILEYS_SERVICE_SECRET: baileysSecret,
    },
    { header: "Local service wiring written by `npm run setup`." },
  );

  for (const [label, result] of [
    ["laya-service/.env", layaFilled],
    ["baileys-service/.env", baileysFilled],
    [".env", rootFilled],
  ]) {
    const touched = [...result.filled, ...result.appended];
    if (touched.length > 0) ok(`${label}: ${touched.join(", ")}`);
    if (result.kept.length > 0) note(`${label}: left as set (${result.kept.join(", ")})`);
  }

  // A mismatch inside the files is harmless at `npm run dev` (the stack passes one value
  // to both sides), but it would bite anyone running a service on its own.
  const rootAfter = readEnvValues(ROOT_ENV);
  const layaAfter = readEnvValues(LAYA_ENV);
  const baileysAfter = readEnvValues(BAILEYS_ENV);

  const layaFileSecret = layaAfter.get("LAYA_SERVICE_SECRET") ?? "";
  if (layaFileSecret.length > 0 && layaFileSecret !== rootAfter.get("LAYA_SERVICE_SECRET")) {
    warn(
      "LAYA_SERVICE_SECRET differs between .env and laya-service/.env; the root value is what `npm run dev` uses",
    );
  }
  const baileysFileSecret = baileysAfter.get("BAILEYS_SERVICE_SECRET") ?? "";
  if (
    baileysFileSecret.length > 0 &&
    baileysFileSecret !== rootAfter.get("BAILEYS_SERVICE_SECRET")
  ) {
    warn(
      "BAILEYS_SERVICE_SECRET differs between .env and baileys-service/.env; the root value is what `npm run dev` uses",
    );
  }

  const database = rootAfter.get("DATABASE_URL") ?? "";
  if (database.trim().length === 0) {
    note("DATABASE_URL is empty — set it in .env, then run `npm run db:setup`");
  }
}

function pythonCandidate() {
  const candidates = ["python3.12", "python3.13", "python3.11", "python3"];
  for (const candidate of candidates) {
    const result = run(candidate, ["--version"], { quiet: true });
    if (!result.ok) continue;
    const match = /Python (\d+)\.(\d+)/.exec(result.output);
    if (!match) continue;
    const [major, minor] = [Number(match[1]), Number(match[2])];
    if (major > 3 || (major === 3 && minor >= 11)) return { command: candidate, minor };
  }
  return null;
}

function dependencyPhase() {
  step("2. Service dependencies");

  if (baileysPrepared()) {
    ok("baileys-service: installed");
  } else {
    const useCi = existsSync(path.join(BAILEYS_DIR, "package-lock.json"));
    const command = useCi ? "ci" : "install";
    say(`  installing baileys-service with \`npm ${command}\``);
    const result = run("npm", [command], { cwd: BAILEYS_DIR, quiet });
    if (result.ok && baileysPrepared()) ok("baileys-service: installed");
    else warn("baileys-service: install failed — run `npm install` in baileys-service/");
  }

  if (!layaSupported()) {
    note("laya-service: skipped — MLX needs Apple silicon (macOS 14+); the app runs without it");
    return;
  }
  if (layaPrepared()) {
    ok("laya-service: installed");
    return;
  }

  if (hasCommand("uv")) {
    say("  installing laya-service with `uv sync --extra dev` (first run creates a Python 3.12 venv)");
    const result = run("uv", ["sync", "--extra", "dev"], { cwd: LAYA_DIR, quiet });
    if (result.ok && layaPrepared()) {
      ok("laya-service: installed");
      return;
    }
    warn(`laya-service: uv sync failed${result.output ? ` — ${result.output.split("\n")[0]}` : ""}`);
    return;
  }

  const python = pythonCandidate();
  if (!python) {
    warn("laya-service: no Python 3.11+ found — install uv (https://docs.astral.sh/uv/) or Python 3.12");
    return;
  }
  if (python.minor > 13) {
    note(
      `laya-service: found ${python.command} (3.${python.minor}); MLX wheels are published for up to 3.13 — install uv for a pinned 3.12 if this fails`,
    );
  }

  say(`  creating laya-service/.venv with ${python.command}`);
  const venv = path.join(LAYA_DIR, ".venv");
  const created = run(python.command, ["-m", "venv", venv], { cwd: LAYA_DIR, quiet });
  if (!created.ok) {
    warn("laya-service: could not create the venv");
    return;
  }
  const installed = run(
    path.join(venv, "bin", "python"),
    ["-m", "pip", "install", "--quiet", "-e", ".[dev]"],
    { cwd: LAYA_DIR, quiet },
  );
  if (installed.ok && layaPrepared()) ok("laya-service: installed");
  else warn("laya-service: pip install failed — run `npm run setup` again to see the output");
}

async function portPhase() {
  if (dependenciesOnly) return;
  const configured = {
    laya: Number(readEnvValues(LAYA_ENV).get("LAYA_PORT")) || DEFAULT_PORTS.laya,
    baileys: Number(readEnvValues(BAILEYS_ENV).get("PORT")) || DEFAULT_PORTS.baileys,
  };
  const notes = [];
  for (const [label, preferred] of Object.entries(configured)) {
    // eslint-disable-next-line no-await-in-loop -- two probes, reported in order
    const free = await findFreePort(preferred);
    if (free === null) notes.push(`${label}: no free port from ${preferred}`);
    else if (free !== preferred) notes.push(`${label}: port ${preferred} is busy, ${free} is free`);
  }
  if (notes.length > 0) {
    step("3. Ports");
    for (const line of notes) note(line);
  }
}

async function main() {
  if (!quiet) {
    console.log("AfterSales AI — local setup");
    console.log(`  repo: ${ROOT}`);
  }

  if (!dependenciesOnly) envPhase();
  if (!envOnly) dependencyPhase();
  await portPhase();

  if (quiet) return;

  step("Next");
  const database = readEnvValues(ROOT_ENV).get("DATABASE_URL") ?? "";
  if (database.trim().length === 0) {
    console.log("  1. put your Postgres URL in .env as DATABASE_URL and DIRECT_URL");
    console.log("     (docs/ENV-SETUP.md walks through it)");
    console.log("  2. npm run db:setup");
  } else {
    console.log("  1. npm run db:setup     (first time only: push schema + seed)");
  }
  console.log("  2. npm run dev          app + Laya decision service + WhatsApp bridge");
  console.log("");
  console.log("  First Laya decision downloads the checkpoint (~900 MB), once.");
}

main().catch((error) => {
  console.error("setup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

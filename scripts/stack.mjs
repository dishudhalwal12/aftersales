#!/usr/bin/env node
/**
 * `npm run dev` — the app plus both local services, in one terminal.
 *
 *   node scripts/stack.mjs                  web + Laya + Baileys
 *   node scripts/stack.mjs --no-laya        web + Baileys
 *   node scripts/stack.mjs --no-baileys     web + Laya
 *   node scripts/stack.mjs --services-only  the two services, for an app you run yourself
 *
 * Each child gets the secrets and URLs the others need, so the three processes agree
 * without anyone copying values between `.env` files. A service that cannot start says
 * why and is skipped; the app still runs, because both services are optional at runtime.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import { readEnvValues } from "./lib/env-file.mjs";
import {
  BAILEYS_DIR,
  LAYA_DIR,
  LAYA_VENV_PYTHON,
  ROOT,
  baileysPrepared,
  findFreePort,
  identifyService,
  isPortFree,
  layaPrepared,
  layaSupported,
  readHealth,
} from "./lib/services.mjs";
import { DEFAULT_PORTS, planStack } from "./lib/stack-plan.mjs";

const args = new Set(process.argv.slice(2));
const mode = {
  noLaya: args.has("--no-laya"),
  noBaileys: args.has("--no-baileys"),
  servicesOnly: args.has("--services-only"),
};

const colour = process.stdout.isTTY;
const PALETTE = { web: 36, laya: 35, baileys: 33, stack: 90 };
const tag = (id) => {
  const text = `[${id}]`.padEnd(10);
  return colour ? `\x1b[${PALETTE[id] ?? 90}m${text}\x1b[0m` : text;
};
const say = (line = "") => process.stdout.write(`${line}\n`);
const stack = (line) => say(colour ? `\x1b[90m${line}\x1b[0m` : line);

const children = new Map();
let stopping = false;

function pipeOutput(child, id) {
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    if (!stream) continue;
    readline.createInterface({ input: stream }).on("line", (line) => {
      target.write(`${tag(id)} ${line}\n`);
    });
  }
}

function start(id, command, commandArgs, { cwd, env }) {
  const child = spawn(command, commandArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group so a wrapper (npm/uv) cannot leave the real server orphaned.
    detached: process.platform !== "win32",
  });
  children.set(id, child);
  pipeOutput(child, id);

  child.on("error", (error) => {
    say(`${tag(id)} could not start: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    children.delete(id);
    if (stopping) return;
    if (id === "laya") {
      // Advisory: losing it costs tickets their decision sheet, nothing else.
      say(`${tag(id)} stopped (${signal ?? code}) — the app keeps running without a decision sheet`);
      return;
    }
    say(`${tag(id)} exited (${signal ?? code}); stopping the stack`);
    void shutdown(typeof code === "number" ? code : 1);
  });

  return child;
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) stop(child);
  const deadline = Date.now() + 4000;
  while (children.size > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- children exit one by one
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const child of children.values()) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stack("");
    stack(`${signal} — stopping the stack`);
    void shutdown(0);
  });
}

// Last resort: whatever ends this process, its children go with it. `stop` is synchronous,
// which is all an `exit` handler is allowed to rely on.
process.on("exit", () => {
  for (const child of children.values()) stop(child);
});

// An unexpected throw still must not leave three servers holding ports.
process.on("uncaughtException", (error) => {
  say(`dev stack crashed: ${error instanceof Error ? error.message : error}`);
  void shutdown(1);
});
process.on("unhandledRejection", (reason) => {
  say(`dev stack crashed: ${reason instanceof Error ? reason.message : reason}`);
  void shutdown(1);
});

/** Poll a health document, reporting what it says once (and only once) per state. */
async function watch(id, url, { timeoutMs = 90_000, interpret } = {}) {
  const started = Date.now();
  let reported = false;
  while (!stopping && !reported) {
    if (!children.has(id)) return;
    // eslint-disable-next-line no-await-in-loop -- polling is inherently sequential
    const health = await readHealth(url);
    if (health) {
      reported = true;
      const line = interpret ? interpret(health) : "ready";
      say(`${tag(id)} ${line}`);
      return;
    }
    if (Date.now() - started > timeoutMs) {
      say(`${tag(id)} has not answered ${url} yet — check its log lines above`);
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- polling is inherently sequential
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function resolvePort(preferred, { label, allowBump, reserved = new Set() }) {
  if (!reserved.has(preferred) && (await isPortFree(preferred))) return preferred;
  if (!allowBump) return null;
  const free = await findFreePort(preferred, { reserved });
  if (free !== null && free !== preferred) {
    stack(`${label} port ${preferred} is already in use — using ${free}`);
  }
  return free;
}

async function main() {
  const rootEnv = readEnvValues(path.join(ROOT, ".env"));
  const layaEnv = readEnvValues(path.join(LAYA_DIR, ".env"));
  const baileysEnv = readEnvValues(path.join(BAILEYS_DIR, ".env"));
  const env = process.env;

  const requestedWebPort = Number(env.WEB_PORT) || DEFAULT_PORTS.web;
  const requestedLayaPort = Number(env.LAYA_PORT) || Number(layaEnv.get("LAYA_PORT")) || DEFAULT_PORTS.laya;
  const requestedBaileysPort = Number(env.PORT) || Number(baileysEnv.get("PORT")) || DEFAULT_PORTS.baileys;

  // Ports already claimed by this run, so the web app and a service never pick the same one.
  const reserved = new Set();

  const webPort = mode.servicesOnly
    ? requestedWebPort
    : await resolvePort(requestedWebPort, { label: "web", allowBump: true, reserved });

  if (!mode.servicesOnly && webPort === null) {
    say(`web port ${requestedWebPort} is in use and no nearby port is free — stop the other server or set WEB_PORT`);
    process.exit(1);
  }
  if (!mode.servicesOnly) reserved.add(webPort);

  const plan = planStack({
    rootEnv,
    env,
    layaEnv,
    baileysEnv,
    ports: {
      web: webPort,
      laya: requestedLayaPort,
      baileys: requestedBaileysPort,
    },
    capabilities: {
      layaSupported: layaSupported(),
      layaPrepared: layaPrepared(),
      baileysPrepared: baileysPrepared(),
    },
    mode,
  });

  // Ports for the services themselves may still be taken; bump each one and re-point the
  // app at the chosen port, since its env was built from the planned one.
  const adjustments = [];
  for (const service of plan.services) {
    if (!reserved.has(service.port) && (await isPortFree(service.port))) {
      reserved.add(service.port);
      continue;
    }

    const occupant = await identifyService(service.url);
    if (occupant) adjustments.push(`${occupant} is already listening on ${service.url}`);

    const free = await findFreePort(service.port + 1, { reserved });
    if (free === null) {
      plan.services = plan.services.filter((entry) => entry.id !== service.id);
      adjustments.push(`no free port near ${service.port} — ${service.id} will not start`);
      continue;
    }

    reserved.add(free);
    adjustments.push(`${service.id} port ${service.port} is taken — using ${free}`);
    const url = `http://127.0.0.1:${free}`;
    if (service.id === "laya") {
      plan.web.env.LAYA_SERVICE_URL = url;
      service.env.LAYA_PORT = String(free);
    } else {
      plan.web.env.BAILEYS_SERVICE_URL = url;
      service.env.PORT = String(free);
    }
    service.port = free;
    service.url = url;
  }

  say("");
  say("AfterSales AI — dev stack");
  say(
    `  ${mode.servicesOnly ? "web      not started (--services-only)" : `web      http://localhost:${plan.web.port}`}`,
  );
  for (const service of plan.services) {
    const detail = service.id === "laya" ? "typed decisions (advisory)" : "WhatsApp bridge";
    say(`  ${service.id.padEnd(8)} ${service.url.padEnd(24)} ${detail}`);
  }
  for (const skip of plan.skipped) say(`  ${skip.id.padEnd(8)} not started — ${skip.reason}`);
  for (const adjustment of adjustments) stack(`  · ${adjustment}`);
  for (const line of plan.notes) stack(`  · ${line}`);
  say("");

  if (!mode.servicesOnly) {
    start("web", process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", "-p", String(plan.web.port)], {
      cwd: ROOT,
      env: plan.web.env,
    });
    void watch("web", `http://127.0.0.1:${plan.web.port}/api/health`, {
      interpret: (health) =>
        `ready — http://localhost:${plan.web.port}  (laya ${health?.integrations?.layaConfigured ? "configured" : "off"}, whatsapp ${health?.integrations?.baileysConfigured ?? "off"})`,
    });
  }

  for (const service of plan.services) {
    if (service.id === "laya") {
      start("laya", LAYA_VENV_PYTHON, ["-m", "laya_service"], { cwd: LAYA_DIR, env: service.env });
      void watch("laya", `${service.url}/health`, {
        interpret: (health) =>
          health.modelReady
            ? `ready — ${service.url} (checkpoint resident, ${health.decisions} decisions)`
            : `listening on ${service.url}; the checkpoint is still loading (the first run downloads it)`,
      });
    } else if (service.id === "baileys") {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      start("baileys", npm, ["run", "dev"], { cwd: BAILEYS_DIR, env: service.env });
      void watch("baileys", `${service.url}/health`, {
        interpret: (health) => `ready — ${service.url} (${health.connections?.total ?? 0} WhatsApp connections)`,
      });
    }
  }

  if (!mode.servicesOnly && plan.services.length === 0) {
    stack("only the app is running; see the reasons above for the services");
  }
}

main().catch((error) => {
  say(`dev stack failed: ${error instanceof Error ? error.message : error}`);
  void shutdown(1);
});

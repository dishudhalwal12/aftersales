// Machine-facing helpers shared by `npm run setup` and `npm run dev`.
//
// Everything here touches the machine (spawn, probe, filesystem) on purpose; the
// decisions themselves live in `stack-plan.mjs` so they can be tested without any of it.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, "..", "..");
export const LAYA_DIR = path.join(ROOT, "laya-service");
export const BAILEYS_DIR = path.join(ROOT, "baileys-service");

export const LAYA_VENV_PYTHON = path.join(
  LAYA_DIR,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

/** Where the MLX checkpoint can run at all. */
export function layaSupported() {
  return process.platform === "darwin" && process.arch === "arm64";
}

/** A command that exists and runs, without printing anything. */
export function hasCommand(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

/**
 * Run a command, streaming its output when the caller wants to see it.
 * Returns `{ ok, status, output }`; never throws for a non-zero exit.
 */
export function run(command, args, { cwd = ROOT, quiet = false, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

/** The service's dependencies are importable, not merely installed. */
export function layaPrepared() {
  if (!layaSupported() || !existsSync(LAYA_VENV_PYTHON)) return false;
  return run(LAYA_VENV_PYTHON, ["-c", "import laya_mlx, fastapi, uvicorn"], {
    cwd: LAYA_DIR,
    quiet: true,
  }).ok;
}

export function baileysPrepared() {
  return existsSync(path.join(BAILEYS_DIR, "node_modules", "tsx"));
}

/**
 * Is anything already answering on this port?
 *
 * Probed by *connecting*, not by binding. A listener bound to `::` (which is how Node
 * and Next bind by default) can leave a 127.0.0.1 bind free on macOS, so a bind probe
 * reports "free" for a port that a running server owns — and the child then dies with
 * EADDRINUSE after the stack already told the app to use it.
 */
export function isPortFree(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      const finish = (free) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(free);
      };
      socket.setTimeout(700);
      socket.once("connect", () => finish(false));
      socket.once("timeout", () => finish(true));
      socket.once("error", () => finish(true));
    });

  return probe("127.0.0.1").then((freeOnV4) => (freeOnV4 ? probe("::1") : false));
}

/** A free port at or after `preferred`, skipping ports another child already claimed. */
export async function findFreePort(preferred, { span = 20, reserved = new Set() } = {}) {
  for (let port = preferred; port < preferred + span; port += 1) {
    if (reserved.has(port)) continue;
    // eslint-disable-next-line no-await-in-loop -- ports must be probed one at a time
    if (await isPortFree(port)) return port;
  }
  return null;
}

/** Which service (if any) is already listening at this URL. */
export async function identifyService(url) {
  const health = await readHealth(`${url}/health`);
  return typeof health?.service === "string" ? health.service : null;
}

/** Fetch a service's own health document, or null when nothing answered. */
export async function readHealth(url, timeoutMs = 1500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

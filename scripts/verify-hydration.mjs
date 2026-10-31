#!/usr/bin/env node
/**
 * Proves that a browser extension rewriting our DOM cannot produce a hydration mismatch.
 *
 * The original report was `/auth` failing with "a tree hydrated but some attributes of the server
 * rendered HTML didn't match", listing `bis_skin_checked`, `bis_register` and
 * `__processed_<uuid>__` — Bitdefender markers written before React hydrated. That cannot be
 * reproduced from a machine that may not have the extension installed, so this script plays the
 * extension's part over the Chrome DevTools Protocol, at the same `document_start` timing:
 *
 *   control     — nothing injected. Must hydrate with zero errors, so a failure here is always
 *                 our own code.
 *   unstripped  — a marker the guard does not know (`data-extension-unknown`). Must produce a
 *                 hydration error, or the simulation has stopped testing anything.
 *   guarded     — the markers the guard does know. Must produce zero hydration errors and leave
 *                 zero of them behind.
 *
 * Usage: node scripts/verify-hydration.mjs [--base http://localhost:3000] [--routes /auth,/home]
 * Needs a running server (npm run dev) and a local Chrome (set CHROME_PATH elsewhere).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HYDRATION_ERROR_PATTERN =
  /hydrat|didn't match|did not match|mismatch|server rendered HTML|server-rendered/i;
const KNOWN_MARKERS = ["bis_skin_checked", "bis_register", "data-gr-ext-installed"];
const UNKNOWN_MARKER = "data-extension-unknown";
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((candidate) => typeof candidate === "string" && candidate.length > 0);

const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9333);
const DEVTOOLS_TIMEOUT_MS = 30_000;
const HYDRATION_TIMEOUT_MS = 20_000;
const SETTLE_MS = 1_000;

/** Plays a DOM-rewriting extension: tags every element, at document start and on every insert. */
function fakeExtensionSource(markers) {
  return `(() => {
  var markers = ${JSON.stringify(markers)};
  function tagElement(el) {
    if (!el || typeof el.setAttribute !== "function") return;
    for (var index = 0; index < markers.length; index += 1) el.setAttribute(markers[index], "1");
  }
  function tagTree(root) {
    if (!root) return;
    if (root.nodeType === 1) tagElement(root);
    if (typeof root.querySelectorAll !== "function") return;
    var all = root.querySelectorAll("*");
    for (var index = 0; index < all.length; index += 1) tagElement(all[index]);
  }
  // document_start runs before <html> exists, so watch the document rather than the element.
  if (typeof MutationObserver === "function") {
    new MutationObserver(function (records) {
      for (var index = 0; index < records.length; index += 1) {
        var added = records[index].addedNodes;
        if (!added) continue;
        for (var child = 0; child < added.length; child += 1) tagTree(added[child]);
      }
    }).observe(document, { subtree: true, childList: true });
  }
  tagTree(document.documentElement);
  document.addEventListener("DOMContentLoaded", function () { tagTree(document.documentElement); });
  window.addEventListener("load", function () { tagTree(document.documentElement); });
})();`;
}

const SCENARIOS = {
  control: null,
  unstripped: [UNKNOWN_MARKER],
  guarded: KNOWN_MARKERS,
};

const options = parseArgs(process.argv.slice(2));
const failures = [];

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (chromePath === undefined) {
  console.error(
    "No Chrome found. Set CHROME_PATH to a Chrome/Chromium binary, or run this check locally.",
  );
  process.exit(2);
}

const profileDir = mkdtempSync(join(tmpdir(), "hydration-guard-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    // Local Network Access gating blocks the dev server's HMR socket in headless Chrome, which
    // otherwise stalls the first navigation past the hydration timeout.
    "--disable-features=LocalNetworkAccessChecks",
    "--disable-gpu",
    "--mute-audio",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const devtools = createDevToolsClient();

try {
  await waitForDevTools();
  await devtools.connect();
  await devtools.send("Runtime.enable");
  await devtools.send("Log.enable");
  await devtools.send("Page.enable");

  for (const route of options.routes) {
    for (const [scenario, markers] of Object.entries(SCENARIOS)) {
      const outcome = await checkRoute(route, scenario, markers);
      const label = `${scenario.padEnd(10)} ${route}`.padEnd(24);
      console.log(`  ${outcome.ok ? "PASS" : "FAIL"}  ${label} ${outcome.summary}`);
      if (!outcome.ok) failures.push(`${scenario} ${route}: ${outcome.summary}`);
    }
  }
} finally {
  devtools.close();
  chrome.kill("SIGKILL");
  await new Promise((resolve) => {
    chrome.once("exit", resolve);
    setTimeout(resolve, 3_000);
  });
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

if (failures.length > 0) {
  console.error(`\nHydration guard check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("\nHydration guard holds: extension-style DOM injection produces no mismatch.");

async function checkRoute(route, scenario, markers) {
  const url = `${options.base}${route}`;
  const consoleEntries = [];
  const stopConsole = devtools.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "error" && params.type !== "warning") return;
    consoleEntries.push(
      params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
    );
  });
  const stopLog = devtools.on("Log.entryAdded", (params) => {
    const { level, text } = params.entry;
    if (level === "error" || level === "warning") consoleEntries.push(text);
  });
  const stopException = devtools.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails;
    consoleEntries.push(
      String(details.exception?.description ?? details.exception?.value ?? details.text ?? "error"),
    );
  });

  const injected =
    markers === null
      ? null
      : await devtools.send("Page.addScriptToEvaluateOnNewDocument", {
          source: fakeExtensionSource(markers),
        });

  try {
    await devtools.send("Page.navigate", { url });
    const hydrated = await waitForHydration();
    if (!hydrated) return { ok: false, summary: `React never hydrated ${url} in time` };

    await delay(SETTLE_MS);

    const leftover = await devtools.evaluate(`(() => {
      var selector = ${JSON.stringify(markers ?? [])}
        .map(function (name) { return "[" + name + "]"; })
        .join(",");
      return selector ? document.querySelectorAll(selector).length : 0;
    })()`);
    const hydrationErrors = consoleEntries.filter((entry) => HYDRATION_ERROR_PATTERN.test(entry));

    if (process.env.VERIFY_DEBUG === "1") {
      debug(
        `${scenario}: ${hydrationErrors.length} hydration error(s), ${leftover} marker(s) left, ${consoleEntries.length} console entry/entries`,
      );
      if (hydrationErrors.length > 0) debug(`${scenario}: ${hydrationErrors[0].slice(0, 1200)}`);
    }

    if (scenario === "control") {
      const clean = hydrationErrors.length === 0;
      return {
        ok: clean,
        summary: clean
          ? "untouched page hydrates cleanly"
          : `${hydrationErrors.length} hydration error(s) with nothing injected — this is our own code`,
      };
    }

    if (scenario === "unstripped") {
      const reproduced = hydrationErrors.length > 0;
      return {
        ok: reproduced,
        summary: reproduced
          ? `simulation is live: an unguarded marker produced ${hydrationErrors.length} hydration error(s)`
          : "no hydration error for an unguarded marker — the simulation is broken, not the app",
      };
    }

    const clean = hydrationErrors.length === 0 && leftover === 0;
    return {
      ok: clean,
      summary: clean
        ? "0 hydration errors, 0 marker attributes left behind"
        : `${hydrationErrors.length} hydration error(s), ${leftover} marker attribute(s) left behind`,
    };
  } finally {
    if (injected !== null) {
      await devtools.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: injected.identifier,
      });
    }
    stopConsole();
    stopLog();
    stopException();
  }
}

/** React tags every node it hydrates, which is a truthful "hydration finished" signal. */
async function waitForHydration() {
  const deadline = Date.now() + HYDRATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const hydrated = await devtools.evaluate(`(() => {
      var all = document.querySelectorAll("*");
      for (var index = 0; index < all.length && index < 400; index += 1) {
        var keys = Object.keys(all[index]);
        for (var key = 0; key < keys.length; key += 1) {
          if (keys[key].indexOf("__reactFiber$") === 0) return true;
        }
      }
      return false;
    })()`);
    if (hydrated === true) return true;
    await delay(150);
  }
  return false;
}

function createDevToolsClient() {
  let socket = null;
  let nextId = 0;
  const pending = new Map();
  const handlers = new Map();

  return {
    async connect() {
      const target = await fetch(`${devToolsBase()}/json/new?about:blank`, { method: "PUT" }).then(
        (response) => response.json(),
      );
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error("could not open the DevTools socket"));
      });
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (typeof message.id === "number" && pending.has(message.id)) {
          const { resolve } = pending.get(message.id);
          pending.delete(message.id);
          resolve(message.result ?? message.error ?? {});
          return;
        }
        for (const handler of handlers.get(message.method) ?? []) handler(message.params);
      };
    },
    send(method, params = {}) {
      const id = (nextId += 1);
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result ? result.result.value : undefined;
    },
    on(method, handler) {
      const set = handlers.get(method) ?? new Set();
      set.add(handler);
      handlers.set(method, set);
      return () => set.delete(handler);
    },
    close() {
      if (socket !== null) {
        try {
          socket.close();
        } catch {
          /* already closed */
        }
      }
    },
  };
}

async function waitForDevTools() {
  const deadline = Date.now() + DEVTOOLS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${devToolsBase()}/json/version`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(150);
  }
  throw new Error(`Chrome DevTools did not come up on port ${DEBUG_PORT}`);
}

function devToolsBase() {
  return `http://127.0.0.1:${DEBUG_PORT}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debug(message) {
  if (process.env.VERIFY_DEBUG === "1") console.error(`  · ${message}`);
}

function parseArgs(argv) {
  const parsed = {
    base: (process.env.HYDRATION_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    routes: ["/auth", "/home"],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--base" && value !== undefined) {
      parsed.base = value.replace(/\/$/, "");
      index += 1;
    } else if (flag === "--routes" && value !== undefined) {
      parsed.routes = value
        .split(",")
        .map((route) => route.trim())
        .filter((route) => route.length > 0);
      index += 1;
    }
  }
  return parsed;
}

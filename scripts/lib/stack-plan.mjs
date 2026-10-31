// Deciding what `npm run dev` should start, without touching the machine.
//
// The whole point of this module being pure is that the interesting rules are testable:
// which service starts, on what port, with which secret, and — when one cannot start —
// what the user is told. `scripts/stack.mjs` does the async part (probing ports, spawning).

import { randomBytes } from "node:crypto";

export const DEFAULT_PORTS = { web: 3000, baileys: 3001, laya: 8100 };

/** A baileys secret shorter than this is refused by the service itself. */
export const MIN_BAILEYS_SECRET = 16;

export function generateSecret() {
  return randomBytes(32).toString("hex");
}

/** Loopback in every spelling this repo uses. Anything else is a deployed endpoint. */
export function isLocalUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A value from the process environment first, then the root `.env`, then the
 * service's own `.env`. `process.env` wins because that is what an operator exporting
 * a variable in the shell expects.
 */
function pick(keys) {
  for (const { value } of keys) {
    const trimmed = text(value);
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

const LOCALHOST = "127.0.0.1";

/**
 * @param {object} input
 * @param {Map<string,string>} input.rootEnv      parsed root `.env`
 * @param {Record<string,string|undefined>} input.env process environment
 * @param {Map<string,string>} input.layaEnv      parsed `laya-service/.env`
 * @param {Map<string,string>} input.baileysEnv   parsed `baileys-service/.env`
 * @param {{web:number, baileys:number, laya:number}} input.ports
 * @param {{layaSupported:boolean, layaPrepared:boolean, baileysPrepared:boolean}} input.capabilities
 * @param {{noLaya?:boolean, noBaileys?:boolean, servicesOnly?:boolean}} input.mode
 * @param {() => string} [input.secretFactory]
 */
export function planStack(input) {
  const {
    rootEnv = new Map(),
    env = {},
    layaEnv = new Map(),
    baileysEnv = new Map(),
    ports = DEFAULT_PORTS,
    capabilities = {},
    mode = {},
    secretFactory = generateSecret,
  } = input;

  const from = (key) => [
    { source: "environment", value: env[key] },
    { source: "root .env", value: rootEnv.get(key) },
  ];

  const webEnv = {};
  const services = [];
  const skipped = [];
  const notes = [];

  // -- Laya (advisory typed decisions) ------------------------------------
  const configuredLayaUrl = pick(from("LAYA_SERVICE_URL"));
  const layaSecret = pick([
    ...from("LAYA_SERVICE_SECRET"),
    { source: "laya-service/.env", value: layaEnv.get("LAYA_SERVICE_SECRET") },
  ]);

  if (mode.noLaya) {
    skipped.push({ id: "laya", reason: "disabled with --no-laya" });
  } else if (configuredLayaUrl.length > 0 && !isLocalUrl(configuredLayaUrl)) {
    skipped.push({ id: "laya", reason: `using the configured remote service at ${configuredLayaUrl}` });
    webEnv.LAYA_SERVICE_URL = configuredLayaUrl;
    if (layaSecret.length > 0) webEnv.LAYA_SERVICE_SECRET = layaSecret;
  } else if (capabilities.layaSupported === false) {
    skipped.push({
      id: "laya",
      reason: "MLX needs Apple silicon (macOS 14+); the app runs without a decision sheet here",
    });
  } else if (capabilities.layaPrepared === false) {
    skipped.push({ id: "laya", reason: "not installed yet — run `npm run setup`" });
  } else {
    const secret = layaSecret.length > 0 ? layaSecret : secretFactory();
    if (layaSecret.length === 0) {
      notes.push("generated a Laya secret for this run; `npm run setup` will write one to .env");
    }
    const url = `http://${LOCALHOST}:${ports.laya}`;
    const pinnedModel = text(layaEnv.get("LAYA_MODEL") ?? "");
    services.push({
      id: "laya",
      label: "laya",
      port: ports.laya,
      url,
      env: {
        LAYA_HOST: LOCALHOST,
        LAYA_PORT: String(ports.laya),
        LAYA_SERVICE_SECRET: secret,
        // A checkpoint pinned in the service's own .env stays pinned.
        ...(pinnedModel ? { LAYA_MODEL: pinnedModel } : {}),
      },
    });
    webEnv.LAYA_SERVICE_URL = url;
    webEnv.LAYA_SERVICE_SECRET = secret;
  }

  // -- Baileys (WhatsApp bridge) ------------------------------------------
  const configuredBaileysUrl = pick(from("BAILEYS_SERVICE_URL"));
  const baileysFileSecret = text(baileysEnv.get("BAILEYS_SERVICE_SECRET"));
  const baileysSecret = pick([
    ...from("BAILEYS_SERVICE_SECRET"),
    { source: "baileys-service/.env", value: baileysFileSecret },
  ]);

  if (mode.noBaileys) {
    skipped.push({ id: "baileys", reason: "disabled with --no-baileys" });
  } else if (configuredBaileysUrl.length > 0 && !isLocalUrl(configuredBaileysUrl)) {
    skipped.push({
      id: "baileys",
      reason: `using the configured remote bridge at ${configuredBaileysUrl}`,
    });
    webEnv.BAILEYS_SERVICE_URL = configuredBaileysUrl;
    if (baileysSecret.length >= MIN_BAILEYS_SECRET) {
      webEnv.BAILEYS_SERVICE_SECRET = baileysSecret;
    }
  } else if (capabilities.baileysPrepared === false) {
    skipped.push({ id: "baileys", reason: "not installed yet — run `npm run setup`" });
  } else {
    let secret = baileysSecret;
    if (secret.length > 0 && secret.length < MIN_BAILEYS_SECRET) {
      notes.push(
        `BAILEYS_SERVICE_SECRET is ${secret.length} characters and the bridge needs ${MIN_BAILEYS_SECRET}, so this run generates one`,
      );
      secret = "";
    }
    if (secret.length === 0) {
      secret = secretFactory();
      notes.push("generated a Baileys secret for this run; `npm run setup` will write one to .env");
    }

    // The bridge posts inbound messages and status events back to the app. Locally that
    // is the same process the stack just started, so the resolved web port is used; a
    // deliberately remote backend URL in the bridge's own .env is left alone.
    const configuredBackend = text(baileysEnv.get("VERCEL_BACKEND_URL"));
    const backendUrl =
      configuredBackend.length > 0 && !isLocalUrl(configuredBackend)
        ? configuredBackend
        : `http://${LOCALHOST}:${ports.web}`;

    const url = `http://${LOCALHOST}:${ports.baileys}`;
    services.push({
      id: "baileys",
      label: "baileys",
      port: ports.baileys,
      url,
      env: {
        PORT: String(ports.baileys),
        BAILEYS_SERVICE_SECRET: secret,
        VERCEL_BACKEND_URL: backendUrl,
        SESSION_STORAGE_PATH: text(baileysEnv.get("SESSION_STORAGE_PATH")) || "./sessions",
      },
    });
    webEnv.BAILEYS_SERVICE_URL = url;
    webEnv.BAILEYS_SERVICE_SECRET = secret;
  }

  return {
    web: { port: ports.web, env: webEnv, enabled: mode.servicesOnly !== true },
    services,
    skipped,
    notes,
  };
}

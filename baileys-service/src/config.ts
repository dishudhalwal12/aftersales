import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Tiny logger so the service has no extra dependency. Callers must never pass
// secrets or auth state into it.
export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info;
  const emit =
    (name: LogLevel, stream: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (LEVEL_WEIGHT[name] < threshold) return;
      stream(`[baileys:${name}]`, ...args);
    };

  return {
    debug: emit("debug", console.debug),
    info: emit("info", console.info),
    warn: emit("warn", console.warn),
    error: emit("error", console.error),
  };
}

/**
 * Adapter for Baileys' pino-style logger.
 *
 * The library logs at `info`/`debug` include QR payloads and credential
 * material, so those stay silent. `warn`/`error` carry protocol failures —
 * Bad MAC, stream errors, conflicts — which are exactly the ones that make a
 * "connected" socket stop delivering messages, so they are forwarded.
 */
export interface BaileysLoggerLike {
  level: string;
  child: () => BaileysLoggerLike;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
}

export function createBaileysLogger(logger: Logger): BaileysLoggerLike {
  const forward =
    (level: "warn" | "error") =>
    (...args: unknown[]): void =>
      logger[level]("baileys", ...args);

  const adapter = {
    level: "warn",
    child(): BaileysLoggerLike {
      return adapter;
    },
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: forward("warn"),
    error: forward("error"),
    fatal: forward("error"),
  };

  return adapter;
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export type ServiceConfig = {
  port: number;
  secret: string;
  webhookUrl: string;
  statusWebhookUrl: string;
  sessionStoragePath: string;
  connectWaitMs: number;
  webhookTimeoutMs: number;
  reconnectMaxDelayMs: number;
  logLevel: LogLevel;
};

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readUrl(value: string | undefined, name: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  return trimmed.replace(/\/+$/, "");
}

// Refuses to start without a strong shared secret, so the HTTP API can never
// accidentally run unauthenticated.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const secret = env.BAILEYS_SERVICE_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "BAILEYS_SERVICE_SECRET is required and must be at least 16 characters."
    );
  }

  const backendUrl = readUrl(env.VERCEL_BACKEND_URL, "VERCEL_BACKEND_URL");
  const webhookUrl = readUrl(env.VERCEL_WEBHOOK_URL, "VERCEL_WEBHOOK_URL");
  const statusWebhookUrl = readUrl(
    env.VERCEL_STATUS_WEBHOOK_URL,
    "VERCEL_STATUS_WEBHOOK_URL"
  );

  if (!webhookUrl && !backendUrl) {
    throw new Error(
      "Set VERCEL_WEBHOOK_URL (or VERCEL_BACKEND_URL to derive it) so incoming messages can reach the backend."
    );
  }

  const level = (env.LOG_LEVEL?.trim() || "info") as LogLevel;
  const logLevel: LogLevel =
    level === "debug" || level === "info" || level === "warn" || level === "error"
      ? level
      : "info";

  return {
    port: intFromEnv(env.PORT, 3001),
    secret,
    webhookUrl: webhookUrl ?? `${backendUrl}/api/channels/whatsapp/inbound`,
    statusWebhookUrl: statusWebhookUrl ?? `${backendUrl}/api/channels/whatsapp/status`,
    sessionStoragePath: path.resolve(
      process.cwd(),
      env.SESSION_STORAGE_PATH?.trim() || "sessions"
    ),
    connectWaitMs: intFromEnv(env.CONNECT_WAIT_MS, 10_000),
    webhookTimeoutMs: intFromEnv(env.WEBHOOK_TIMEOUT_MS, 10_000),
    reconnectMaxDelayMs: intFromEnv(env.RECONNECT_MAX_DELAY_MS, 30_000),
    logLevel,
  };
}

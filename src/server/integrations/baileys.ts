// Client for the local Baileys WhatsApp service. The service is reached over
// HTTP with a shared secret that only lives in backend environment variables;
// the frontend never talks to it and never sees Baileys credentials.

import { createHash, timingSafeEqual } from "node:crypto";

import { IntegrationError } from "./errors.ts";

export const BAILEYS_SECRET_HEADER = "x-baileys-secret";

export const BAILEYS_STATUSES = [
  "connecting",
  "qr",
  "connected",
  "disconnected",
  "logged_out",
] as const;

export type BaileysConnectionStatus = (typeof BAILEYS_STATUSES)[number];

export type BaileysConnectionSnapshot = {
  connectionId: string;
  businessId?: string;
  status: BaileysConnectionStatus;
  qr: string | null;
  qrExpiresAt: string | null;
  connectedAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ServiceConfig = {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
};

// The service's /connect waits up to CONNECT_WAIT_MS (default 10s) before
// replying, so the client budget must be larger than that.
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const STATUS_SET = new Set<string>(BAILEYS_STATUSES);

export function isBaileysStatus(value: unknown): value is BaileysConnectionStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

function readServiceConfig(): ServiceConfig | null {
  const baseUrl = process.env.BAILEYS_SERVICE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.BAILEYS_SERVICE_SECRET?.trim();
  if (!baseUrl || !secret) return null;

  const parsedTimeout = Number(process.env.BAILEYS_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(Math.round(parsedTimeout), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  return { baseUrl, secret, timeoutMs };
}

export function isBaileysConfigured(): boolean {
  return readServiceConfig() !== null;
}

export type BaileysProbe =
  | { configured: false }
  | {
      configured: true;
      reachable: true;
      uptimeSeconds: number | null;
      connections: { total: number; connected: number };
    }
  | { configured: true; reachable: false; error: string };

// A probe answers a human looking at a status page, so it must fail fast. The
// 15s connect budget belongs to a request that blocks on a QR; reusing it here
// would leave the page hanging for the same 15s before admitting the laptop is
// asleep. /health is deliberately unauthenticated, so the shared secret is not
// sent to it — a liveness endpoint has no business holding a credential.
const PROBE_TIMEOUT_MS = 2_500;

function parseHealth(body: unknown):
  | { uptimeSeconds: number | null; connections: { total: number; connected: number } }
  | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (record.status !== "ok") return null;

  const raw = record.connections;
  if (typeof raw !== "object" || raw === null) return null;
  const { total, connected } = raw as Record<string, unknown>;
  if (typeof total !== "number" || typeof connected !== "number") return null;

  return {
    uptimeSeconds:
      typeof record.uptimeSeconds === "number" ? Math.round(record.uptimeSeconds) : null,
    connections: { total, connected },
  };
}

/**
 * Answers whether the bridge on the laptop is actually awake.
 *
 * `isBaileysConfigured()` only proves the two variables are set. With the
 * bridge hosted on a machine that sleeps, the useful question is reachability,
 * so this never throws: a probe that fails is a result, not an error.
 */
export async function probeBaileysService(
  fetchImpl: FetchLike = fetch
): Promise<BaileysProbe> {
  const config = readServiceConfig();
  if (!config) return { configured: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${config.baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { configured: true, reachable: false, error: `The bridge answered ${response.status}.` };
    }

    const parsed = parseHealth(await response.json());
    if (parsed === null) {
      return {
        configured: true,
        reachable: false,
        error: "The bridge answered with a body this app does not recognise.",
      };
    }

    return { configured: true, reachable: true, ...parsed };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      configured: true,
      reachable: false,
      error: aborted ? "The bridge timed out." : "The bridge is unreachable.",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Guards the service -> backend webhooks. An unset secret means the service is
// not wired up yet, so the route answers 503 rather than running open.
export function assertBaileysSecret(provided: string | null | undefined): void {
  const config = readServiceConfig();
  if (!config) {
    throw new IntegrationError(
      503,
      "BAILEYS_NOT_CONFIGURED",
      "The local WhatsApp service is not configured on this deployment."
    );
  }

  if (!provided) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Missing WhatsApp service secret.");
  }

  const expected = createHash("sha256").update(config.secret, "utf8").digest();
  const actual = createHash("sha256").update(provided, "utf8").digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Invalid WhatsApp service secret.");
  }
}

export function isBaileysConnectionMissing(error: unknown): boolean {
  return (
    error instanceof IntegrationError &&
    error.status === 404 &&
    error.reason === "CONNECTION_NOT_FOUND"
  );
}

function invalidResponse(): IntegrationError {
  return new IntegrationError(
    502,
    "BAILEYS_INVALID_RESPONSE",
    "The local WhatsApp service returned an unexpected response."
  );
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readServiceError(data: unknown): { code: string; message: string } | null {
  if (typeof data !== "object" || data === null) return null;
  const error = (data as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;

  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;
  return { code, message };
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSnapshot(data: unknown, fallbackConnectionId: string): BaileysConnectionSnapshot {
  if (typeof data !== "object" || data === null) throw invalidResponse();
  const record = data as Record<string, unknown>;
  if (typeof record.status !== "string" || !STATUS_SET.has(record.status)) {
    throw invalidResponse();
  }

  return {
    connectionId:
      typeof record.connectionId === "string" ? record.connectionId : fallbackConnectionId,
    ...(typeof record.businessId === "string" ? { businessId: record.businessId } : {}),
    status: record.status as BaileysConnectionStatus,
    qr: toNullableString(record.qr),
    qrExpiresAt: toNullableString(record.qrExpiresAt),
    connectedAt: toNullableString(record.connectedAt),
    phoneNumber: toNullableString(record.phoneNumber),
    lastError: toNullableString(record.lastError),
  };
}

async function requestService(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fetchImpl: FetchLike
): Promise<unknown> {
  const config = readServiceConfig();
  if (!config) {
    throw new IntegrationError(
      503,
      "BAILEYS_NOT_CONFIGURED",
      "The local WhatsApp service is not configured on this deployment."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        [BAILEYS_SECRET_HEADER]: config.secret,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new IntegrationError(
      502,
      "BAILEYS_UNAVAILABLE",
      aborted
        ? "The local WhatsApp service timed out."
        : "The local WhatsApp service is unreachable.",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => "");
  const data: unknown = text ? parseJsonOrNull(text) : null;

  if (!response.ok) {
    // 401/403 here means our stored secret is wrong, not that the browser
    // user is unauthenticated.
    if (response.status === 401 || response.status === 403) {
      throw new IntegrationError(
        502,
        "BAILEYS_AUTH_FAILED",
        "The local WhatsApp service rejected the backend credentials."
      );
    }

    const serviceError = readServiceError(data);
    if (serviceError) {
      throw new IntegrationError(response.status, serviceError.code, serviceError.message);
    }

    throw new IntegrationError(
      502,
      "BAILEYS_UNAVAILABLE",
      `The local WhatsApp service answered with status ${response.status}.`
    );
  }

  if (data === null) throw invalidResponse();
  return data;
}

export async function startBaileysConnection(
  connectionId: string,
  businessId: string,
  fetchImpl: FetchLike = fetch
): Promise<BaileysConnectionSnapshot> {
  const data = await requestService(
    "/connect",
    { method: "POST", body: { connectionId, businessId } },
    fetchImpl
  );
  return parseSnapshot(data, connectionId);
}

// Combines /status with /qr so the dashboard can poll one endpoint. The QR is
// only fetched while the service reports a QR state.
export async function getBaileysConnection(
  connectionId: string,
  fetchImpl: FetchLike = fetch
): Promise<BaileysConnectionSnapshot> {
  const encoded = encodeURIComponent(connectionId);
  const status = parseSnapshot(
    await requestService(`/status/${encoded}`, { method: "GET" }, fetchImpl),
    connectionId
  );

  if (status.status !== "qr") return status;

  const qrSnapshot = parseSnapshot(
    await requestService(`/qr/${encoded}`, { method: "GET" }, fetchImpl),
    connectionId
  );

  return {
    ...status,
    qr: qrSnapshot.qr,
    qrExpiresAt: qrSnapshot.qrExpiresAt ?? status.qrExpiresAt,
    connectedAt: qrSnapshot.connectedAt ?? status.connectedAt,
  };
}

export async function disconnectBaileysConnection(
  connectionId: string,
  businessId: string,
  options: { logout?: boolean; fetchImpl?: FetchLike } = {}
): Promise<BaileysConnectionSnapshot> {
  const { logout = true, fetchImpl = fetch } = options;
  const data = await requestService(
    `/disconnect/${encodeURIComponent(connectionId)}`,
    { method: "POST", body: { businessId, logout } },
    fetchImpl
  );
  return parseSnapshot(data, connectionId);
}

export async function sendBaileysMessage(
  connectionId: string,
  businessId: string,
  recipient: string,
  message: string,
  fetchImpl: FetchLike = fetch
): Promise<{ messageId: string }> {
  const data = await requestService(
    "/send",
    { method: "POST", body: { connectionId, businessId, recipient, message } },
    fetchImpl
  );

  if (typeof data !== "object" || data === null) throw invalidResponse();
  const messageId = (data as { messageId?: unknown }).messageId;
  if (typeof messageId !== "string") throw invalidResponse();

  return { messageId };
}

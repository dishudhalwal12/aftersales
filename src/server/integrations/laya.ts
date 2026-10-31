// Client for the local Laya typed-decision service (see `laya-service/README.md`).
//
// This is an advisory layer, so unlike the Baileys client it never throws: a missing
// model box, a refused message and a malformed reply all come back as a reason the
// ticket can record. Triage must complete with or without it, and R1–R7 never reads a
// value from here.

import type {
  DecisionKind,
  DecisionOption,
  DecisionSheet,
  DecisionSheetFailure,
  LayaDecision,
} from "../../shared/domain.ts";

export const LAYA_SECRET_HEADER = "x-laya-secret";

const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_TIMEOUT_MS = 30_000;

const DECISION_KINDS: ReadonlySet<string> = new Set<DecisionKind>([
  "choice",
  "score",
  "noul",
]);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ServiceConfig = {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
};

export type DecisionSheetResult =
  | { ok: true; sheet: DecisionSheet }
  | { ok: false; reason: DecisionSheetFailure; message: string };

function readServiceConfig(): ServiceConfig | null {
  const baseUrl = process.env.LAYA_SERVICE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.LAYA_SERVICE_SECRET?.trim();
  if (!baseUrl || !secret) return null;

  const parsedTimeout = Number(process.env.LAYA_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(Math.round(parsedTimeout), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  return { baseUrl, secret, timeoutMs };
}

/** Both variables must be set; half-configured counts as off, never as half-working. */
export function isLayaConfigured(): boolean {
  return readServiceConfig() !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUnitInterval(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function parseOptions(value: unknown): DecisionOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: DecisionOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const label = entry["label"];
    const probability = readUnitInterval(entry["probability"]);
    if (typeof label !== "string" || label.length === 0 || probability === null) return null;
    options.push({ label, probability });
  }
  return options;
}

function parseDecision(value: unknown): LayaDecision | null {
  if (!isRecord(value)) return null;

  const id = value["id"];
  const kind = value["kind"];
  const title = value["title"];
  const verdict = value["verdict"];
  const probability = readUnitInterval(value["probability"]);
  const confidence = readUnitInterval(value["confidence"]);
  const options = parseOptions(value["options"]);

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof kind !== "string" || !DECISION_KINDS.has(kind)) return null;
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof verdict !== "string" || verdict.length === 0) return null;
  if (probability === null || confidence === null || options === null) return null;

  const decision: LayaDecision = {
    id,
    kind: kind as DecisionKind,
    title,
    verdict,
    probability,
    confidence,
    options,
  };

  if (value["value"] !== undefined) {
    const level = readUnitInterval(value["value"]);
    if (level === null) return null;
    decision.value = level;
  }

  return decision;
}

/** Strict parse. Anything off-contract is `null`, never a coerced sheet. */
export function parseDecisionSheet(value: unknown): DecisionSheet | null {  if (!isRecord(value)) return null;

  const provider = value["provider"];
  const model = value["model"];
  const sheetVersion = value["sheetVersion"];
  const latencyMs = value["latencyMs"];
  const decisions = value["decisions"];

  if (provider !== "laya-mlx") return null;
  if (typeof model !== "string" || model.length === 0) return null;
  if (typeof sheetVersion !== "number" || !Number.isInteger(sheetVersion)) return null;
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) return null;
  if (!Array.isArray(decisions) || decisions.length === 0) return null;

  const parsed: LayaDecision[] = [];
  for (const entry of decisions) {
    const decision = parseDecision(entry);
    if (!decision) return null;
    parsed.push(decision);
  }

  return { provider: "laya-mlx", model, sheetVersion, latencyMs, decisions: parsed };
}

/**
 * Parse a sheet that was persisted on a ticket.
 *
 * An empty column is a ticket triaged while the service was unavailable; junk means the
 * stored value no longer matches this contract. Both read as "no sheet", so an old ticket
 * degrades to no panel instead of breaking the queue.
 */
export function parseStoredDecisionSheet(raw: string | null | undefined): DecisionSheet | null {
  // A row read by a client generated before the column existed has no value here at all;
  // that is "no sheet", not a reason to fail the whole queue.
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    return parseDecisionSheet(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function readServiceError(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const error = data["error"];
  if (!isRecord(error)) return null;
  const message = error["message"];
  return typeof message === "string" && message.length > 0 ? message : null;
}

function failure(reason: DecisionSheetFailure, message: string): DecisionSheetResult {
  return { ok: false, reason, message };
}

/**
 * Ask the service what it thinks about one customer message.
 *
 * The message is sent unchanged. The service caps it at its own configured length and
 * answers 400 when it is longer, which is reported as `rejected` — truncating here would
 * quietly score a different message than the one on the ticket.
 */
export async function fetchDecisionSheet(
  message: string,
  fetchImpl: FetchLike = fetch,
): Promise<DecisionSheetResult> {
  const config = readServiceConfig();
  if (!config) {
    return failure(
      "not_configured",
      "The Laya decision service is not configured on this deployment.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/decision-sheet`, {
      method: "POST",
      headers: {
        [LAYA_SECRET_HEADER]: config.secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return aborted
      ? failure("timeout", "The Laya decision service did not answer in time.")
      : failure("unreachable", "The Laya decision service is unreachable.");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const serviceMessage = readServiceError(data);
    return failure(
      "rejected",
      serviceMessage ?? `The Laya decision service answered with status ${response.status}.`,
    );
  }

  const sheet = parseDecisionSheet(data);
  if (!sheet) {
    return failure("invalid_response", "The Laya decision service returned an unexpected body.");
  }

  return { ok: true, sheet };
}

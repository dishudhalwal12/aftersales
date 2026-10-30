// Sarvam voice session lifecycle: outbound call with per-call variables,
// session resolution for mid-call tool lookups, business-scoped grounding,
// and completion handling that escalates to the Live Queue.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import type { Business, VoiceTestSession } from "@prisma/client";

import { ApiError } from "./api";
import { prisma } from "./db";
import { searchMarkdownRag, tokenize } from "./rag";

export class SarvamError extends Error {
  readonly code: "NOT_CONFIGURED" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: SarvamError["code"], message: string) {
    super(message);
    this.name = "SarvamError";
    this.code = code;
  }
}

export const VOICE_SESSION_TTL_MS = 10 * 60 * 1000;
export const ACTIVE_VOICE_STATUSES = ["initiated", "ringing", "in_progress"] as const;

export type VoiceSessionWithBusiness = VoiceTestSession & { business: Business };

type SarvamConfig = {
  apiKey: string;
  agentId: string;
  baseUrl: string;
  callPath: string;
  virtualNumber: string | null;
  timeoutMs: number;
};

function validPhone(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
}

export function readSarvamConfig(): SarvamConfig | null {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  const agentId = process.env.SARVAM_AGENT_ID?.trim();
  if (!apiKey || !agentId) return null;

  const timeout = Number(process.env.SARVAM_TIMEOUT_MS ?? 15_000);
  return {
    apiKey,
    agentId,
    baseUrl: (process.env.SARVAM_API_BASE_URL?.trim() || "https://api.sarvam.ai").replace(
      /\/+$/,
      ""
    ),
    callPath: process.env.SARVAM_OUTBOUND_PATH?.trim() || "/v1/voice-agents/calls",
    virtualNumber: validPhone(process.env.SARVAM_VIRTUAL_NUMBER),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
  };
}

export function isSarvamConfigured(): boolean {
  return readSarvamConfig() !== null;
}

// Only identity and routing metadata travel per call. Business facts stay in
// the database and are fetched by the tool endpoint — never baked into the
// shared agent or echoed from caller speech.
export function buildVoiceVariables(business: Business, session: VoiceTestSession) {
  return {
    business_name: business.name,
    business_type: business.businessType,
    demo_pin: session.demoPin,
    session_id: session.id,
  };
}

function extractInteractionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  for (const key of ["id", "call_id", "callId", "interaction_id", "interactionId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const key of ["call", "data"]) {
    const found = extractInteractionId(record[key]);
    if (found) return found;
  }

  return null;
}

export type SarvamCallDependencies = {
  fetch?: typeof fetch;
};

export async function startOutboundCall(
  session: VoiceTestSession,
  business: Business,
  deps: SarvamCallDependencies = {}
): Promise<{ interactionId: string | null }> {
  const config = readSarvamConfig();
  if (!config) {
    throw new SarvamError(
      "NOT_CONFIGURED",
      "SARVAM_API_KEY and SARVAM_AGENT_ID must be set to place calls."
    );
  }

  const fetchImpl = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}${config.callPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": config.apiKey,
      },
      body: JSON.stringify({
        agent_id: config.agentId,
        to: session.judgePhone,
        ...(config.virtualNumber ? { from: config.virtualNumber } : {}),
        variables: buildVoiceVariables(business, session),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SarvamError(
        "REQUEST_FAILED",
        `Sarvam outbound call failed with HTTP ${response.status}.`
      );
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return { interactionId: extractInteractionId(payload) };
  } catch (error) {
    if (error instanceof SarvamError) throw error;
    if ((error as { name?: string }).name === "AbortError") {
      throw new SarvamError("TIMEOUT", "Sarvam outbound call timed out.");
    }
    throw new SarvamError(
      "REQUEST_FAILED",
      error instanceof Error ? error.message : "Sarvam outbound call failed."
    );
  } finally {
    clearTimeout(timer);
  }
}

async function generateDemoPin(): Promise<string> {
  const now = new Date();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = String(randomInt(1000, 10000));
    const clash = await prisma.voiceTestSession.findFirst({
      where: {
        demoPin: pin,
        expiresAt: { gt: now },
        status: { in: [...ACTIVE_VOICE_STATUSES] },
      },
      select: { id: true },
    });
    if (!clash) return pin;
  }
  return String(randomInt(1000, 10000));
}

export async function createVoiceSession(
  businessId: string,
  judgePhone: string
): Promise<VoiceTestSession> {
  return prisma.voiceTestSession.create({
    data: {
      businessId,
      judgePhone,
      demoPin: await generateDemoPin(),
      status: "initiated",
      expiresAt: new Date(Date.now() + VOICE_SESSION_TTL_MS),
    },
  });
}

export type VoiceSessionSelector = {
  sessionId?: string;
  demoPin?: string;
  callerPhone?: string;
};

// Resolution order: explicit session id, then PIN, then caller phone. Only
// unexpired, active sessions count, and the business always comes from the
// session row — never from the request payload.
export async function resolveVoiceSession(
  selector: VoiceSessionSelector,
  now = new Date()
): Promise<VoiceSessionWithBusiness | null> {
  const active = {
    expiresAt: { gt: now },
    status: { in: [...ACTIVE_VOICE_STATUSES] },
  };

  if (selector.sessionId) {
    const session = await prisma.voiceTestSession.findFirst({
      where: { id: selector.sessionId, ...active },
      include: { business: true },
    });
    if (session) return session;
  }

  if (selector.demoPin) {
    const session = await prisma.voiceTestSession.findFirst({
      where: { demoPin: selector.demoPin, ...active },
      orderBy: { createdAt: "desc" },
      include: { business: true },
    });
    if (session) return session;
  }

  if (selector.callerPhone) {
    const session = await prisma.voiceTestSession.findFirst({
      where: { judgePhone: selector.callerPhone, ...active },
      orderBy: { createdAt: "desc" },
      include: { business: true },
    });
    if (session) return session;
  }

  return null;
}

export type VoiceGrounding = {
  businessName: string;
  groundedFacts: string;
  citedChunkIds: string[];
  confidenceScore: number;
  escalateToHuman: boolean;
};

// Deterministic confidence from the BM25 top score. 5.0+ lands in the 90s,
// 2.0 around 63, and anything weak falls below the 50 escalation line.
export function scoreToConfidence(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(99, Math.round(100 * (1 - Math.exp(-score / 2))));
}

const MAX_SPOKEN_FACTS = 1600;
const MAX_CITED_CHUNKS = 3;

function escalateGrounding(
  business: Pick<Business, "name">,
  confidence: number
): VoiceGrounding {
  return {
    businessName: business.name,
    groundedFacts: `I could not find a reliable answer to that in ${business.name}'s saved information. Let me connect you with the team.`,
    citedChunkIds: [],
    confidenceScore: confidence,
    escalateToHuman: true,
  };
}

export async function answerVoiceQuery(
  business: Pick<Business, "id" | "name">,
  query: string
): Promise<VoiceGrounding> {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return escalateGrounding(business, 0);

  const retrieved = await searchMarkdownRag(business.id, query, 4);

  // Section titles such as "Products & Pricing" are shared across businesses,
  // so a chunk only counts when the query matches its own content or keywords.
  const candidates = retrieved
    .map((chunk) => {
      const terms = new Set(
        tokenize(`${chunk.keywords.replace(/,/g, " ")} ${chunk.content}`)
      );
      return { chunk, matched: queryTerms.filter((term) => terms.has(term)) };
    })
    .filter((candidate) => candidate.matched.length > 0);

  const top = candidates[0];
  if (!top) return escalateGrounding(business, 0);

  // Cite the best chunk, then only chunks that cover a query term the answer
  // does not yet cover — extra incidental chunks would just add noise.
  const cited = [top];
  const covered = new Set(top.matched);
  for (const candidate of candidates.slice(1, MAX_CITED_CHUNKS)) {
    if (!candidate.matched.some((term) => !covered.has(term))) continue;
    cited.push(candidate);
    candidate.matched.forEach((term) => covered.add(term));
    if (covered.size === queryTerms.length) break;
  }

  const coverage = covered.size / queryTerms.length;
  // Evidence accumulates across cited chunks: a question split over two chunks
  // is as answerable as one the top chunk covers alone. Coverage then scales it
  // down quadratically, so missing a third of a three-term question falls back
  // to a human instead of guessing.
  const strength = cited.reduce((sum, candidate) => sum + candidate.chunk.score, 0);
  const confidence = Math.round(
    scoreToConfidence(strength) * coverage * coverage
  );

  if (confidence < 50) return escalateGrounding(business, confidence);

  let groundedFacts = cited.map((candidate) => candidate.chunk.content.trim()).join("\n\n");
  if (groundedFacts.length > MAX_SPOKEN_FACTS) {
    groundedFacts = `${groundedFacts.slice(0, MAX_SPOKEN_FACTS - 1)}…`;
  }

  return {
    businessName: business.name,
    groundedFacts,
    citedChunkIds: cited.map((candidate) => candidate.chunk.id),
    confidenceScore: confidence,
    escalateToHuman: false,
  };
}

function safeEqual(expected: string, provided: string): boolean {
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  const providedHash = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedHash, providedHash);
}

export function assertToolSecret(provided: string | null): void {
  const expected = process.env.SARVAM_TOOL_SECRET?.trim();
  if (!expected) {
    throw new ApiError(
      503,
      "SARVAM_NOT_CONFIGURED",
      "SARVAM_TOOL_SECRET is not configured; voice tooling is disabled."
    );
  }
  if (!provided || !safeEqual(expected, provided)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid Sarvam tool secret.");
  }
}

export function assertWebhookSecret(provided: string | null): void {
  const expected = process.env.SARVAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    throw new ApiError(
      503,
      "SARVAM_NOT_CONFIGURED",
      "SARVAM_WEBHOOK_SECRET is not configured; voice callbacks are disabled."
    );
  }
  if (!provided || !safeEqual(expected, provided)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid Sarvam webhook secret.");
  }
}

export type VoiceCompletionInput = {
  sessionId: string;
  status?: "completed" | "failed";
  sarvamInteractionId?: string;
  transcript?: string;
  durationSeconds?: number;
  callerRequestedHuman?: boolean;
  resolved?: boolean;
};

export type VoiceCompletionOutcome = {
  session: VoiceTestSession;
  escalationOutcome: "resolved_by_ai" | "escalated_to_owner" | null;
  ticketId: string | null;
  duplicateTicket: boolean;
};

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function handleVoiceCompletion(
  input: VoiceCompletionInput
): Promise<VoiceCompletionOutcome> {
  const session = await prisma.voiceTestSession.findUnique({
    where: { id: input.sessionId },
    include: { business: true },
  });
  if (!session) {
    throw new ApiError(404, "VOICE_SESSION_NOT_FOUND", "Voice session not found.");
  }

  const status = input.status ?? "completed";
  const shouldEscalate =
    status === "completed" &&
    (input.callerRequestedHuman === true || input.resolved === false);
  const escalationOutcome =
    status === "failed"
      ? null
      : shouldEscalate
        ? "escalated_to_owner"
        : "resolved_by_ai";

  const updated = await prisma.voiceTestSession.update({
    where: { id: session.id },
    data: {
      status,
      escalationOutcome,
      ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
      ...(input.durationSeconds !== undefined
        ? { durationSeconds: input.durationSeconds }
        : {}),
      ...(input.sarvamInteractionId
        ? { sarvamInteractionId: input.sarvamInteractionId }
        : {}),
    },
  });

  if (!shouldEscalate) {
    return { session: updated, escalationOutcome, ticketId: null, duplicateTicket: false };
  }

  const externalMessageId = `voice_${session.id}`;
  const existing = await prisma.ticket.findUnique({ where: { externalMessageId } });
  if (existing) {
    return {
      session: updated,
      escalationOutcome,
      ticketId: existing.id,
      duplicateTicket: true,
    };
  }

  const rule = input.callerRequestedHuman ? "R1" : "R2";
  const querySource =
    input.transcript?.trim() || "Voice call completed without a resolved answer.";
  const now = Date.now();

  try {
    const ticket = await prisma.ticket.create({
      data: {
        businessId: session.businessId,
        externalMessageId,
        channel: "VOICE",
        customerName: "Voice Caller",
        customerHandle: session.judgePhone,
        customerQuery: querySource.slice(0, 2000),
        state: "escalated",
        specialistAssigned: "general",
        intent: input.callerRequestedHuman ? "voice_human_request" : "voice_unresolved",
        sentiment: "neutral",
        urgencyScore: 60,
        confidenceScore: 0,
        actionStatus: "escalated",
        routingRuleHit: rule,
        aiDraftOrReply: input.callerRequestedHuman
          ? "Caller asked for a human; owner follow-up required."
          : "Voice call ended without a grounded resolution; owner follow-up required.",
        citedChunkIds: "[]",
        events: {
          create: [
            {
              eventType: "INBOUND_RECEIVED",
              payload: JSON.stringify({
                channel: "VOICE",
                sessionId: session.id,
                interactionId: input.sarvamInteractionId ?? session.sarvamInteractionId,
              }),
              createdAt: new Date(now),
            },
            {
              eventType: "ROUTING_DECIDED",
              payload: JSON.stringify({
                ruleHit: rule,
                actionStatus: "escalated",
                shouldAutoSend: false,
                callerRequestedHuman: input.callerRequestedHuman === true,
                resolved: input.resolved,
              }),
              createdAt: new Date(now + 1),
            },
            {
              eventType: "ESCALATED",
              payload: JSON.stringify({
                reason: rule,
                escalationOutcome,
                durationSeconds: input.durationSeconds ?? null,
              }),
              createdAt: new Date(now + 2),
            },
          ],
        },
      },
    });

    return {
      session: updated,
      escalationOutcome,
      ticketId: ticket.id,
      duplicateTicket: false,
    };
  } catch (error) {
    if (uniqueConstraint(error)) {
      const winner = await prisma.ticket.findUnique({ where: { externalMessageId } });
      if (winner) {
        return {
          session: updated,
          escalationOutcome,
          ticketId: winner.id,
          duplicateTicket: true,
        };
      }
    }
    throw error;
  }
}

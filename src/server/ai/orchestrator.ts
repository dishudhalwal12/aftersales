/**
 * LLM orchestration — one structured call per inbound contact (PRD §4.2).
 *
 * Two providers, one contract:
 *   openrouter — real model, strict JSON, any failure becomes Rule R7 downstream.
 *   heuristic  — no network: retrieval-scored classifier used when no key is set.
 *                It is labelled `degraded` everywhere it surfaces, so the app can
 *                never pass itself off as model-backed when it is not.
 */

import { bestSentences, retrievalConfidence } from "./rag.ts";
import type {
  BusinessFacts,
  LlmResponse,
  RetrievedChunk,
  Sentiment,
  Specialist,
} from "../../shared/domain.ts";

export type LlmProvider = "openrouter" | "heuristic";

export interface OrchestratorSuccess {
  ok: true;
  result: LlmResponse;
  provider: LlmProvider;
  degraded: boolean;
}

export interface OrchestratorFailure {
  ok: false;
  error: string;
  provider: LlmProvider;
}

export type OrchestratorResult = OrchestratorSuccess | OrchestratorFailure;

const PROVIDERS: ReadonlySet<string> = new Set(["openrouter", "heuristic"]);
const SPECIALISTS: ReadonlySet<string> = new Set(["general", "technical", "sales"]);
const SENTIMENTS: ReadonlySet<string> = new Set([
  "positive",
  "neutral",
  "frustrated",
  "distressed",
]);

export interface ProviderEnv {
  LLM_PROVIDER?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
}

/**
 * Explicit `LLM_PROVIDER` always wins. Unset falls back to openrouter when a key
 * exists, otherwise to the labelled offline provider.
 */
export function resolveProvider(env: ProviderEnv): LlmProvider {
  const configured = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (PROVIDERS.has(configured)) return configured as LlmProvider;
  return (env.OPENROUTER_API_KEY ?? "").trim().length > 0 ? "openrouter" : "heuristic";
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Strict validation. Anything off-contract is a failure, never a coercion. */
export function validateLlmResponse(value: unknown): LlmResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const specialist = candidate["specialist"];
  const sentiment = candidate["sentiment"];
  const intent = candidate["intent"];
  const replyText = candidate["reply_text"];
  const cited = candidate["cited_chunk_ids"];

  if (typeof specialist !== "string" || !SPECIALISTS.has(specialist)) return null;
  if (typeof sentiment !== "string" || !SENTIMENTS.has(sentiment)) return null;
  if (typeof intent !== "string" || intent.trim().length === 0) return null;
  if (typeof replyText !== "string") return null;
  if (typeof candidate["explicit_human_request"] !== "boolean") return null;
  if (typeof candidate["requires_human_judgment"] !== "boolean") return null;
  if (!isIntegerInRange(candidate["urgency_score"], 0, 100)) return null;
  if (!isIntegerInRange(candidate["confidence_score"], 0, 100)) return null;
  if (!Array.isArray(cited) || cited.some((id) => typeof id !== "string")) return null;

  return {
    specialist: specialist as Specialist,
    intent: intent.trim().slice(0, 80),
    sentiment: sentiment as Sentiment,
    urgency_score: candidate["urgency_score"],
    confidence_score: candidate["confidence_score"],
    explicit_human_request: candidate["explicit_human_request"],
    requires_human_judgment: candidate["requires_human_judgment"],
    cited_chunk_ids: [...new Set(cited)] as string[],
    reply_text: replyText.trim(),
  };
}

// ---------------------------------------------------------------------------
// Offline (heuristic) provider
// ---------------------------------------------------------------------------

const TECHNICAL = /\b(export|error|bug|fail|broken|install|setup|set up|integrat|api|gstr|json|login|crash|troubleshoot|not working|sync|migrat|downtime|outage)\b/i;
const SALES = /\b(price|pricing|cost|charge|plan|discount|upgrade|buy|purchase|subscription|fee|quote|compar|trial|billing cycle)\b/i;
const DISTRESSED = /\b(terrible|worst|furious|angry|unacceptable|disgusting|lawyer|legal|sue|fraud|scam|emergency|harass|appalling|ridiculous)\b/i;
const FRUSTRATED = /\b(frustrat|annoy|again|still|twice|third time|second time|keep|waiting|late|delay|broken|not working|no response|no reply|nobody|ignored|asked)\b/i;
const POSITIVE = /\b(thanks|thank you|great|love|awesome|perfect|excellent|amazing|happy|helpful)\b/i;
const HUMAN_REQUEST = /\b(human|real person|manager|representative|supervisor|talk to someone|speak to someone|agent)\b/i;
const HUMAN_JUDGMENT = /\b(lawyer|legal|sue|court|police|safety|injur|allerg|medical emergency|refund dispute|chargeback|fraud|scam)\b/i;
const URGENT = /\b(urgent|urgently|asap|immediately|right now|emergency|today|tonight|tomorrow|deadline|production is down|system is down|outage)\b/i;

function specialistFor(query: string): Specialist {
  if (TECHNICAL.test(query)) return "technical";
  if (SALES.test(query)) return "sales";
  return "general";
}

function intentFor(query: string, specialist: Specialist): string {
  if (HUMAN_REQUEST.test(query)) return "human_escalation";
  if (/\brefund|return|cancel|money back\b/i.test(query)) return "refund_policy";
  if (/\bprice|pricing|plan|cost|charge|subscription|discount\b/i.test(query)) return "pricing_inquiry";
  if (/\bhour|open|close|timing|timings\b/i.test(query)) return "hours_inquiry";
  if (/\bappointment|booking|book|slot|reschedul\b/i.test(query)) return "booking_request";
  if (/\bexport|error|bug|fail|install|setup|not working|crash\b/i.test(query)) return "technical_issue";
  if (specialist === "sales") return "sales_inquiry";
  return "general_inquiry";
}

export function heuristicSentiment(query: string): Sentiment {
  if (DISTRESSED.test(query)) return "distressed";
  if (FRUSTRATED.test(query)) return "frustrated";
  if (POSITIVE.test(query)) return "positive";
  return "neutral";
}

export function heuristicUrgency(query: string, sentiment: Sentiment): number {
  let score = 20;
  if (URGENT.test(query)) score += 35;
  if (sentiment === "distressed") score += 30;
  if (sentiment === "frustrated") score += 10;
  if (/\brefund|charged twice|payment failed|charged\b/i.test(query)) score += 20;
  if (/\bdown|outage|not working|data loss\b/i.test(query)) score += 15;
  return Math.max(0, Math.min(100, score));
}

function offlineDecision(
  business: BusinessFacts,
  query: string,
  retrieved: readonly RetrievedChunk[],
): LlmResponse {
  const specialist = specialistFor(query);
  const sentiment = heuristicSentiment(query);
  const top = retrieved[0];
  const confidence = top ? retrievalConfidence(query, retrieved) : 0;
  const grounded = confidence >= 50 && retrieved.length > 0;

  const cited = grounded ? retrieved.slice(0, 2).map((chunk) => chunk.id) : [];
  const answer = grounded
    ? retrieved
        .slice(0, 2)
        .map((chunk) => bestSentences(query, chunk.content, 2))
        .join(" ")
        .slice(0, 700)
    : `I don't want to guess on this one. Let me get a human from ${business.name} to answer you directly — they'll be with you shortly.`;

  return {
    specialist,
    intent: intentFor(query, specialist),
    sentiment,
    urgency_score: heuristicUrgency(query, sentiment),
    confidence_score: confidence,
    explicit_human_request: HUMAN_REQUEST.test(query),
    requires_human_judgment: HUMAN_JUDGMENT.test(query),
    cited_chunk_ids: cited,
    reply_text: answer,
  };
}

// ---------------------------------------------------------------------------
// OpenRouter provider
// ---------------------------------------------------------------------------

function buildSystemPrompt(business: BusinessFacts): string {
  return [
    `You are the internal AI Support & Triage Engine for "${business.name}" (${business.businessType}).`,
    `Tone: ${business.agentTone}.`,
    "",
    "CRITICAL GROUNDING RULES:",
    "1. You may ONLY use facts explicitly present in the PROVIDED KNOWLEDGE CHUNKS below.",
    "2. Never invent prices, policies, hours, links, or technical steps.",
    "3. Select the best internal runtime specialist:",
    '   - "general": FAQs, hours, policies, order/appointment inquiries.',
    '   - "technical": troubleshooting, bug reports, setup steps, usage help.',
    '   - "sales": pricing comparisons, plan upgrades, product recommendations, discounts.',
    "4. Output strictly valid JSON matching this schema and nothing else:",
    "{",
    '  "specialist": "general" | "technical" | "sales",',
    '  "intent": "short snake_case label",',
    '  "sentiment": "positive" | "neutral" | "frustrated" | "distressed",',
    '  "urgency_score": integer 0-100,',
    '  "confidence_score": integer 0-100 (MUST be < 50 if the chunks do not directly answer the question),',
    '  "explicit_human_request": boolean,',
    '  "requires_human_judgment": boolean (severe distress, legal threat, billing dispute, safety issue),',
    '  "cited_chunk_ids": array of the exact chunk ids used, empty [] if none match,',
    '  "reply_text": grounded reply, or a polite hand-off message when confidence < 50',
    "}",
  ].join("\n");
}

function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Header values must be ASCII: fetch rejects any code point above 255 with a
// ByteString error before the request leaves the process, which silently turned
// every classifier call into R7. Keep this export ASCII-only.
export function openRouterRequestHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "AfterSales AI - Team 41",
  };
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  business: BusinessFacts,
  query: string,
  retrieved: readonly RetrievedChunk[],
): Promise<LlmResponse> {
  const chunkBlock = retrieved
    .map((chunk) => `[chunk_id: ${chunk.id}] (${chunk.section})\n${chunk.content}`)
    .join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterRequestHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(business) },
        {
          role: "user",
          content: `PROVIDED KNOWLEDGE CHUNKS:\n\n${chunkBlock || "(none retrieved)"}\n\nCUSTOMER MESSAGE:\n${query}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    // Keep the provider's reason: a bare status code hides key, credit and
    // model-access failures behind the same number.
    const detail = (await response.text().catch(() => "")).trim().slice(0, 300);
    throw new Error(
      `classifier provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("classifier provider returned an empty completion");
  }

  const parsed = validateLlmResponse(extractJson(content));
  if (!parsed) throw new Error("classifier output failed schema validation");
  return parsed;
}

export interface ClassifyInput {
  business: BusinessFacts;
  query: string;
  retrieved: readonly RetrievedChunk[];
  env?: ProviderEnv & { LLM_MODEL_ID?: string | undefined };
}

export async function classifyAndDraft(input: ClassifyInput): Promise<OrchestratorResult> {
  const env = input.env ?? {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    LLM_MODEL_ID: process.env.LLM_MODEL_ID,
  };
  const provider = resolveProvider(env);

  if (provider === "heuristic") {
    return {
      ok: true,
      result: offlineDecision(input.business, input.query, input.retrieved),
      provider,
      degraded: true,
    };
  }

  const apiKey = (env.OPENROUTER_API_KEY ?? "").trim();
  if (apiKey.length === 0) {
    return { ok: false, provider, error: "OPENROUTER_API_KEY is not set" };
  }

  try {
    const result = await callOpenRouter(
      apiKey,
      (env.LLM_MODEL_ID ?? "").trim() || "meta-llama/llama-3.3-70b-instruct",
      input.business,
      input.query,
      input.retrieved,
    );
    return { ok: true, result, provider, degraded: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "classifier call failed";
    return { ok: false, provider, error: message };
  }
}

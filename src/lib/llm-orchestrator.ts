// Single-pass classifier + specialist answer (PRD §4.2). The model is asked
// for strict JSON; anything else is a runtime failure so routing falls back
// to R7 instead of guessing.

import { z } from "zod";

import type { RagSearchResult } from "./rag";
import type { LLMResponse } from "./routing-engine";

export type LLMErrorCode =
  | "NOT_CONFIGURED"
  | "REQUEST_FAILED"
  | "INVALID_RESPONSE"
  | "TIMEOUT";

export class LLMError extends Error {
  readonly code: LLMErrorCode;

  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.name = "LLMError";
    this.code = code;
  }
}

type BusinessPromptContext = {
  name: string;
  businessType: string;
  agentTone: string;
};

const scoreSchema = z.coerce.number().transform((value) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
);

const llmResponseSchema = z.object({
  specialist: z.enum(["general", "technical", "sales"]).catch("general"),
  intent: z.string().trim().min(1).max(80).catch("unknown"),
  sentiment: z.enum(["positive", "neutral", "frustrated", "distressed"]).catch("neutral"),
  urgency_score: scoreSchema,
  confidence_score: scoreSchema,
  explicit_human_request: z.boolean().catch(false),
  requires_human_judgment: z.boolean().catch(false),
  cited_chunk_ids: z.array(z.string()).catch([]),
  reply_text: z.string().trim().min(1).max(4000),
});

function buildSystemPrompt(business: BusinessPromptContext, chunks: RagSearchResult[]): string {
  const knowledge =
    chunks.length === 0
      ? "(No knowledge chunks matched this query.)"
      : chunks
          .map(
            (chunk) =>
              `[chunk_id: ${chunk.id} | section: ${chunk.section}]\n${chunk.content}`
          )
          .join("\n\n");

  return `You are the internal AI Support & Triage Engine for "${business.name}" (${business.businessType}).
Tone: ${business.agentTone}.

CRITICAL GROUNDING RULES:
1. You may ONLY use facts explicitly present in the PROVIDED KNOWLEDGE CHUNKS below.
2. Never invent prices, policies, hours, links, or technical steps.
3. Select the best internal runtime specialist:
   - "general": FAQs, hours, policies, order/appointment inquiries.
   - "technical": troubleshooting, bug reports, setup steps, usage help.
   - "sales": pricing comparisons, plan upgrades, product recommendations, discounts.
4. Output strictly valid JSON matching this schema:
{
  "specialist": "general" | "technical" | "sales",
  "intent": "string (short label e.g. refund_policy, pricing_inquiry, technical_bug)",
  "sentiment": "positive" | "neutral" | "frustrated" | "distressed",
  "urgency_score": number (0 to 100),
  "confidence_score": number (0 to 100, MUST be < 50 if chunks do not directly answer the question),
  "explicit_human_request": boolean (true if user asks for a person/human/agent/manager),
  "requires_human_judgment": boolean (true if user reports severe distress, legal threat, billing dispute, or safety issue),
  "cited_chunk_ids": ["array of exact chunk IDs used to form the answer, empty [] if none match"],
  "reply_text": "Grounded response to the customer, or a polite escalation/clarification message if confidence < 50"
}

PROVIDED KNOWLEDGE CHUNKS:
${knowledge}`;
}

function stripCodeFences(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function generateTriageResponse(input: {
  business: BusinessPromptContext;
  chunks: RagSearchResult[];
  query: string;
}): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new LLMError(
      "NOT_CONFIGURED",
      "OPENROUTER_API_KEY is not configured; refusing to fabricate an answer."
    );
  }

  const baseUrl = (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.LLM_MODEL_ID?.trim() || "meta-llama/llama-3.3-70b-instruct";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 20_000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.AUTH_URL?.trim() || "http://localhost:3000",
        "X-Title": "AfterSales AI",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(input.business, input.chunks) },
          {
            role: "user",
            content: `CUSTOMER QUERY:\n${input.query}\n\nReturn ONLY the JSON object described in the system prompt.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new LLMError(
      timedOut ? "TIMEOUT" : "REQUEST_FAILED",
      timedOut
        ? `LLM request timed out after ${timeoutMs}ms.`
        : `LLM request failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError(
      "REQUEST_FAILED",
      `LLM provider returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LLMError("INVALID_RESPONSE", "LLM response was not valid JSON.");
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new LLMError("INVALID_RESPONSE", "LLM returned an empty completion.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(content));
  } catch {
    throw new LLMError("INVALID_RESPONSE", "LLM completion was not parseable JSON.");
  }

  const parsed = llmResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new LLMError(
      "INVALID_RESPONSE",
      `LLM JSON did not match the triage schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`
    );
  }

  return parsed.data;
}

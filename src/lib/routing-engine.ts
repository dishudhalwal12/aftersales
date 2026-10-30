/**
 * Deterministic routing engine — PRD rev 4 §4.3.
 *
 * The LLM never decides whether a message is sent. It proposes; these seven
 * ordered rules dispose. First match wins.
 */

import type { LlmResponse, RoutingDecision } from "./types.ts";

export interface RoutingInput {
  /** The classifier output, or null when the classifier could not produce one. */
  llmResult: LlmResponse | null;
  /** Chunk ids that provably belong to this business (tenant-scoped). */
  validChunkIdsForBusiness: ReadonlySet<string>;
  /** Whether the inbound channel is allowed to auto-send at all. */
  channelAutoSendAllowed: boolean;
  /** Set when the provider, tool or runtime failed. */
  runtimeError?: boolean;
}

const ESCALATE = {
  actionStatus: "escalated",
  ticketState: "escalated",
  shouldAutoSend: false,
} as const;

export function evaluateRoutingRules(input: RoutingInput): RoutingDecision {
  // R7 — fail safe. A broken classifier is never a silent reply.
  if (input.runtimeError === true || input.llmResult === null) {
    return { ruleHit: "R7", ...ESCALATE, actionStatus: "failed" };
  }

  const result = input.llmResult;

  // Only chunks that belong to this business count as grounding.
  const verifiedChunks = result.cited_chunk_ids.filter((id) =>
    input.validChunkIdsForBusiness.has(id),
  );

  // R1 — the customer asked for a person.
  if (result.explicit_human_request) {
    return { ruleHit: "R1", ...ESCALATE };
  }

  // R2 — the hard floor. Low confidence or no verified grounding.
  if (result.confidence_score < 50 || verifiedChunks.length === 0) {
    return { ruleHit: "R2", ...ESCALATE };
  }

  // R3 — distress or a case that needs human judgment.
  if (result.requires_human_judgment || result.sentiment === "distressed") {
    return { ruleHit: "R3", ...ESCALATE };
  }

  // R4 — urgency threshold.
  if (result.urgency_score >= 80) {
    return { ruleHit: "R4", ...ESCALATE };
  }

  // R5 — grounded but this channel is draft-only.
  if (!input.channelAutoSendAllowed) {
    return { ruleHit: "R5", actionStatus: "draft", ticketState: "triaged", shouldAutoSend: false };
  }

  // R6 — eligible grounded answer.
  return { ruleHit: "R6", actionStatus: "answered", ticketState: "replied", shouldAutoSend: true };
}

/** Map an action status onto the ticket state the row should carry. */
export function ticketStateForAction(
  decision: RoutingDecision,
): "triaged" | "replied" | "escalated" {
  return decision.ticketState;
}

/** Human-readable reason shown in the dashboard next to the rule badge. */
export const RULE_REASONS: Readonly<Record<RoutingDecision["ruleHit"], string>> = {
  R1: "explicit request for a human",
  R2: "low confidence or no grounded source",
  R3: "distress or human-judgment case",
  R4: "urgency at or above 80",
  R5: "channel is draft-only",
  R6: "grounded answer eligible to auto-send",
  R7: "classifier or provider failure — failed safe",
};

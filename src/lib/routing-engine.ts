// Deterministic routing (PRD §4.3). The LLM classifies and drafts; this
// function alone decides whether anything may be sent automatically.

import type { ActionStatus, RoutingRule, Sentiment, Specialist } from "./constants";

export type LLMResponse = {
  specialist: Specialist;
  intent: string;
  sentiment: Sentiment;
  urgency_score: number;
  confidence_score: number;
  explicit_human_request: boolean;
  requires_human_judgment: boolean;
  cited_chunk_ids: string[];
  reply_text: string;
};

export type RoutingInput = {
  llmResult: LLMResponse | null;
  validChunkIdsForBusiness: ReadonlySet<string>;
  channelAutoSendAllowed: boolean;
  runtimeError?: boolean;
};

export type RoutingDecision = {
  ruleHit: RoutingRule;
  actionStatus: ActionStatus;
  ticketState: "triaged" | "replied" | "escalated";
  shouldAutoSend: boolean;
};

export function evaluateRoutingRules(input: RoutingInput): RoutingDecision {
  // R7: Classifier, provider, tool, or runtime failure -> fail safe; do not auto-send
  if (input.runtimeError || !input.llmResult) {
    return { ruleHit: "R7", actionStatus: "failed", ticketState: "escalated", shouldAutoSend: false };
  }

  const {
    confidence_score,
    urgency_score,
    explicit_human_request,
    requires_human_judgment,
    sentiment,
    cited_chunk_ids,
  } = input.llmResult;

  // Verify cited chunks actually belong to this business
  const verifiedChunks = (cited_chunk_ids || []).filter((id) =>
    input.validChunkIdsForBusiness.has(id)
  );

  // R1: Customer explicitly asks for a human -> escalate
  if (explicit_human_request) {
    return { ruleHit: "R1", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R2: Confidence < 50 OR zero verified retrieved chunks -> do not auto-send; escalate
  if (confidence_score < 50 || verifiedChunks.length === 0) {
    return { ruleHit: "R2", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R3: Distress / complaint requiring human judgment -> escalate
  if (requires_human_judgment || sentiment === "distressed") {
    return { ruleHit: "R3", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R4: Urgency >= 80 -> escalate
  if (urgency_score >= 80) {
    return { ruleHit: "R4", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R5: Channel configured draft-only -> draft, do not send
  if (!input.channelAutoSendAllowed) {
    return { ruleHit: "R5", actionStatus: "draft", ticketState: "triaged", shouldAutoSend: false };
  }

  // R6: Eligible grounded answer (Confidence >= 50 AND >=1 verified chunk AND Urgency < 80)
  return { ruleHit: "R6", actionStatus: "answered", ticketState: "replied", shouldAutoSend: true };
}

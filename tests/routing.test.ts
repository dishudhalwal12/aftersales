import { describe, expect, it } from "vitest";

import {
  evaluateRoutingRules,
  type LLMResponse,
  type RoutingInput,
} from "@/lib/routing-engine";

const VALID_CHUNK_IDS = new Set(["chk_test_a_01", "chk_test_a_02"]);

function llm(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    specialist: "general",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 90,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: ["chk_test_a_01"],
    reply_text: "The Pro Plan costs ₹1,499 per month.",
    ...overrides,
  };
}

function route(overrides: Partial<RoutingInput> = {}) {
  return evaluateRoutingRules({
    llmResult: llm(),
    validChunkIdsForBusiness: VALID_CHUNK_IDS,
    channelAutoSendAllowed: true,
    ...overrides,
  });
}

describe("evaluateRoutingRules", () => {
  it("R7: fails safe when the LLM result is missing", () => {
    const decision = route({ llmResult: null });
    expect(decision).toEqual({
      ruleHit: "R7",
      actionStatus: "failed",
      ticketState: "escalated",
      shouldAutoSend: false,
    });
  });

  it("R7: fails safe on a runtime error even with a valid answer", () => {
    const decision = route({ runtimeError: true });
    expect(decision.ruleHit).toBe("R7");
    expect(decision.shouldAutoSend).toBe(false);
  });

  it("R1: escalates an explicit human request before anything else", () => {
    const decision = route({
      llmResult: llm({ explicit_human_request: true, confidence_score: 99 }),
    });
    expect(decision).toEqual({
      ruleHit: "R1",
      actionStatus: "escalated",
      ticketState: "escalated",
      shouldAutoSend: false,
    });
  });

  it("R2: confidence 49 never auto-sends", () => {
    const decision = route({ llmResult: llm({ confidence_score: 49 }) });
    expect(decision.ruleHit).toBe("R2");
    expect(decision.actionStatus).toBe("escalated");
    expect(decision.shouldAutoSend).toBe(false);
  });

  it("R2: confidence 50 is allowed to proceed", () => {
    const decision = route({ llmResult: llm({ confidence_score: 50 }) });
    expect(decision.ruleHit).toBe("R6");
    expect(decision.shouldAutoSend).toBe(true);
  });

  it("R2: high confidence with only cross-tenant citations escalates", () => {
    const decision = route({
      llmResult: llm({ cited_chunk_ids: ["chk_other_business_01"], confidence_score: 97 }),
    });
    expect(decision.ruleHit).toBe("R2");
    expect(decision.shouldAutoSend).toBe(false);
  });

  it("R2: empty citation list escalates even at high confidence", () => {
    const decision = route({ llmResult: llm({ cited_chunk_ids: [] }) });
    expect(decision.ruleHit).toBe("R2");
  });

  it("R3: escalates distress or human judgment cases", () => {
    expect(route({ llmResult: llm({ sentiment: "distressed" }) }).ruleHit).toBe("R3");
    expect(route({ llmResult: llm({ requires_human_judgment: true }) }).ruleHit).toBe("R3");
  });

  it("R4: escalates urgency >= 80", () => {
    expect(route({ llmResult: llm({ urgency_score: 80 }) }).ruleHit).toBe("R4");
    expect(route({ llmResult: llm({ urgency_score: 79 }) }).ruleHit).toBe("R6");
  });

  it("R2 outranks R4 when confidence is below 50", () => {
    const decision = route({ llmResult: llm({ confidence_score: 40, urgency_score: 95 }) });
    expect(decision.ruleHit).toBe("R2");
  });

  it("R5: drafts but never sends when the channel forbids auto-send", () => {
    const decision = route({ channelAutoSendAllowed: false });
    expect(decision).toEqual({
      ruleHit: "R5",
      actionStatus: "draft",
      ticketState: "triaged",
      shouldAutoSend: false,
    });
  });

  it("R6: grounded, confident, low-urgency answers on an auto-send channel", () => {
    const decision = route();
    expect(decision).toEqual({
      ruleHit: "R6",
      actionStatus: "answered",
      ticketState: "replied",
      shouldAutoSend: true,
    });
  });
});

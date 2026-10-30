import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { evaluateRoutingRules, RULE_REASONS } from "../../src/lib/routing-engine.ts";
import type { LlmResponse } from "../../src/lib/types.ts";

function decision(overrides: Partial<LlmResponse> = {}): LlmResponse {
  return {
    specialist: "general",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 84,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: ["chk_cp_02"],
    reply_text: "The Pro Plan is ₹1,499 per month.",
    ...overrides,
  };
}

const validChunks = new Set(["chk_cp_02", "chk_cp_03"]);

describe("evaluateRoutingRules — happy path", () => {
  it("R6 auto-sends a grounded, confident, non-urgent answer", () => {
    const result = evaluateRoutingRules({
      llmResult: decision(),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.deepEqual(result, {
      ruleHit: "R6",
      actionStatus: "answered",
      ticketState: "replied",
      shouldAutoSend: true,
    });
  });

  it("R5 holds a grounded answer as a draft when the channel is draft-only", () => {
    const result = evaluateRoutingRules({
      llmResult: decision(),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: false,
    });
    assert.equal(result.ruleHit, "R5");
    assert.equal(result.actionStatus, "draft");
    assert.equal(result.shouldAutoSend, false);
    assert.equal(result.ticketState, "triaged");
  });
});

describe("evaluateRoutingRules — AT-06 confidence boundary", () => {
  it("escalates at confidence 49", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 49 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R2");
    assert.equal(result.actionStatus, "escalated");
    assert.equal(result.shouldAutoSend, false);
  });

  it("never auto-sends at confidence 0", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 0, cited_chunk_ids: [] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R2");
    assert.equal(result.shouldAutoSend, false);
  });

  it("escalates at confidence 50 when no cited chunk belongs to the business", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 50, cited_chunk_ids: [] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R2");
    assert.equal(result.shouldAutoSend, false);
  });

  it("escalates when every cited chunk belongs to another tenant", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 99, cited_chunk_ids: ["chk_js_02", "chk_nb_01"] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R2");
    assert.equal(result.shouldAutoSend, false);
  });

  it("auto-sends at exactly confidence 50 with one verified chunk", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 50, cited_chunk_ids: ["chk_cp_03"] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R6");
    assert.equal(result.shouldAutoSend, true);
  });

  it("ignores a fabricated chunk id as long as one real citation remains", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ cited_chunk_ids: ["chk_fake_99", "chk_cp_02"] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R6");
  });
});

describe("evaluateRoutingRules — escalation rules", () => {
  it("AT-07 escalates at urgency 80 even with high confidence", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ urgency_score: 80, confidence_score: 97 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R4");
    assert.equal(result.actionStatus, "escalated");
  });

  it("does not escalate at urgency 79", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ urgency_score: 79 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R6");
  });

  it("AT-08 escalates on an explicit human request", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ explicit_human_request: true, confidence_score: 95 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R1");
    assert.equal(result.shouldAutoSend, false);
  });

  it("escalates a distressed customer even with a grounded answer", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ sentiment: "distressed", confidence_score: 90 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R3");
  });

  it("escalates when the case needs human judgment", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ requires_human_judgment: true }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R3");
  });
});

describe("evaluateRoutingRules — R7 fail-safe (AT-11)", () => {
  it("fails safe when the classifier returned nothing", () => {
    const result = evaluateRoutingRules({
      llmResult: null,
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.deepEqual(result, {
      ruleHit: "R7",
      actionStatus: "failed",
      ticketState: "escalated",
      shouldAutoSend: false,
    });
  });

  it("fails safe on a runtime error even if a decision exists", () => {
    const result = evaluateRoutingRules({
      llmResult: decision(),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
      runtimeError: true,
    });
    assert.equal(result.ruleHit, "R7");
    assert.equal(result.actionStatus, "failed");
    assert.equal(result.shouldAutoSend, false);
  });
});

describe("evaluateRoutingRules — rule order", () => {
  it("checks R1 before R2", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ explicit_human_request: true, confidence_score: 10, cited_chunk_ids: [] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R1");
  });

  it("checks R2 before R3", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ confidence_score: 10, sentiment: "distressed", cited_chunk_ids: [] }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    });
    assert.equal(result.ruleHit, "R2");
  });

  it("checks R4 before R5", () => {
    const result = evaluateRoutingRules({
      llmResult: decision({ urgency_score: 99 }),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: false,
    });
    assert.equal(result.ruleHit, "R4");
  });

  it("is total — it never throws on adversarial input", () => {
    const hostile = [
      decision({ confidence_score: Number.NaN as unknown as number }),
      decision({ urgency_score: -1 }),
      decision({ cited_chunk_ids: [] }),
    ];
    for (const llmResult of hostile) {
      const result = evaluateRoutingRules({
        llmResult,
        validChunkIdsForBusiness: validChunks,
        channelAutoSendAllowed: true,
      });
      assert.ok(["R1", "R2", "R3", "R4", "R5", "R6", "R7"].includes(result.ruleHit));
    }
  });

  it("is pure — the same input always yields the same decision", () => {
    const input = {
      llmResult: decision(),
      validChunkIdsForBusiness: validChunks,
      channelAutoSendAllowed: true,
    };
    assert.deepEqual(evaluateRoutingRules(input), evaluateRoutingRules(input));
  });
});

describe("RULE_REASONS", () => {
  it("explains every rule the engine can return", () => {
    for (const rule of ["R1", "R2", "R3", "R4", "R5", "R6", "R7"] as const) {
      assert.ok(RULE_REASONS[rule].length > 0, rule);
    }
  });
});

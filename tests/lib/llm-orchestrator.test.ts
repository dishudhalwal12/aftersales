import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  classifyAndDraft,
  heuristicSentiment,
  heuristicUrgency,
  resolveProvider,
  validateLlmResponse,
} from "../../src/lib/llm-orchestrator.ts";
import { compileBrainMd, chunkMarkdown, searchMarkdownRag } from "../../src/lib/rag.ts";
import { BUSINESS_A, BUSINESS_B } from "../../src/lib/seed-facts.ts";
import type { BrainChunk } from "../../src/lib/types.ts";

function buildChunks(business: typeof BUSINESS_A): BrainChunk[] {
  return chunkMarkdown(compileBrainMd(business.facts)).map((draft, index) => ({
    ...draft,
    id: `chk_${business.chunkPrefix}_${String(index + 1).padStart(2, "0")}`,
    chunkIndex: index,
  }));
}

const chunksA = buildChunks(BUSINESS_A);
const chunksB = buildChunks(BUSINESS_B);
const heuristicEnv = { LLM_PROVIDER: "heuristic" };

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 94,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: ["chk_cp_02"],
    reply_text: "The Pro Plan is ₹1,499 per month.",
    ...overrides,
  };
}

describe("resolveProvider", () => {
  it("honours an explicit heuristic setting even when a key exists", () => {
    assert.equal(resolveProvider({ LLM_PROVIDER: "heuristic", OPENROUTER_API_KEY: "sk-or-x" }), "heuristic");
  });

  it("uses openrouter when explicitly configured", () => {
    assert.equal(resolveProvider({ LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or-x" }), "openrouter");
  });

  it("falls back to openrouter when a key is present and no provider is set", () => {
    assert.equal(resolveProvider({ OPENROUTER_API_KEY: "sk-or-x" }), "openrouter");
  });

  it("falls back to the offline provider when nothing is configured", () => {
    assert.equal(resolveProvider({}), "heuristic");
  });

  it("ignores an unknown provider name", () => {
    assert.equal(resolveProvider({ LLM_PROVIDER: "gpt-9", OPENROUTER_API_KEY: "sk-or-x" }), "openrouter");
  });
});

describe("validateLlmResponse", () => {
  it("accepts an exact contract payload", () => {
    const parsed = validateLlmResponse(validPayload());
    assert.equal(parsed?.confidence_score, 94);
    assert.deepEqual(parsed?.cited_chunk_ids, ["chk_cp_02"]);
  });

  it("deduplicates cited chunk ids", () => {
    const parsed = validateLlmResponse(validPayload({ cited_chunk_ids: ["chk_cp_02", "chk_cp_02"] }));
    assert.deepEqual(parsed?.cited_chunk_ids, ["chk_cp_02"]);
  });

  const rejections: Array<[string, unknown]> = [
    ["null", null],
    ["a string", "hello"],
    ["a missing specialist", validPayload({ specialist: undefined })],
    ["an unknown specialist", validPayload({ specialist: "billing" })],
    ["an unknown sentiment", validPayload({ sentiment: "angry" })],
    ["an empty intent", validPayload({ intent: "  " })],
    ["confidence above 100", validPayload({ confidence_score: 101 })],
    ["negative confidence", validPayload({ confidence_score: -1 })],
    ["fractional confidence", validPayload({ confidence_score: 49.5 })],
    ["confidence as a string", validPayload({ confidence_score: "94" })],
    ["urgency above 100", validPayload({ urgency_score: 200 })],
    ["a non-boolean human request", validPayload({ explicit_human_request: "yes" })],
    ["a non-array citation list", validPayload({ cited_chunk_ids: "chk_cp_02" })],
    ["a non-string citation", validPayload({ cited_chunk_ids: [2] })],
    ["a missing reply", validPayload({ reply_text: undefined })],
  ];

  for (const [label, payload] of rejections) {
    it(`rejects ${label}`, () => {
      assert.equal(validateLlmResponse(payload), null);
    });
  }
});

describe("heuristic provider — offline classification", () => {
  it("answers a pricing question from the right business", async () => {
    const query = "What is the price of the Pro Plan and does it include WhatsApp invoicing?";
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query,
      retrieved: searchMarkdownRag(chunksA, query),
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.provider, "heuristic");
    assert.equal(outcome.degraded, true);
    assert.equal(outcome.result.specialist, "sales");
    assert.ok(outcome.result.confidence_score >= 50);
    assert.ok(outcome.result.cited_chunk_ids.length > 0);
    assert.ok(outcome.result.reply_text.includes("1,499"));
  });

  it("refuses the same question under a business that has no such plan", async () => {
    const query = "What is the price of the Pro Plan and does it include WhatsApp invoicing?";
    const outcome = await classifyAndDraft({
      business: BUSINESS_B.facts,
      query,
      retrieved: searchMarkdownRag(chunksB, query),
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    assert.ok(outcome.result.confidence_score < 50);
    assert.deepEqual(outcome.result.cited_chunk_ids, []);
    assert.ok(outcome.result.reply_text.toLowerCase().includes("human"));
  });

  it("only ever cites chunk ids it was given", async () => {
    const query = "What are your prices and hours?";
    const retrieved = searchMarkdownRag(chunksA, query);
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query,
      retrieved,
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    const allowed = new Set(retrieved.map((chunk) => chunk.id));
    for (const id of outcome.result.cited_chunk_ids) assert.ok(allowed.has(id));
  });

  it("routes technical questions to the technical specialist", async () => {
    const query = "How do I export GSTR-1 as JSON?";
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query,
      retrieved: searchMarkdownRag(chunksA, query),
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.result.specialist, "technical");
  });

  it("detects an explicit human request", async () => {
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query: "Let me talk to a real human manager please.",
      retrieved: searchMarkdownRag(chunksA, "talk to a real human manager"),
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.result.explicit_human_request, true);
    assert.equal(outcome.result.intent, "human_escalation");
  });

  it("returns an empty answer path when nothing is retrieved", async () => {
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query: "Do you sell bicycles?",
      retrieved: [],
      env: heuristicEnv,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.result.confidence_score, 0);
    assert.deepEqual(outcome.result.cited_chunk_ids, []);
  });

  it("is deterministic for the same input", async () => {
    const query = "Can I get a refund after cancelling?";
    const retrieved = searchMarkdownRag(chunksA, query);
    const first = await classifyAndDraft({ business: BUSINESS_A.facts, query, retrieved, env: heuristicEnv });
    const second = await classifyAndDraft({ business: BUSINESS_A.facts, query, retrieved, env: heuristicEnv });
    assert.deepEqual(first.ok ? first.result : null, second.ok ? second.result : null);
  });
});

describe("heuristic sentiment and urgency", () => {
  it("reads distress", () => {
    assert.equal(heuristicSentiment("This is unacceptable, I will speak to my lawyer"), "distressed");
  });

  it("reads frustration", () => {
    assert.equal(heuristicSentiment("I have asked twice and nobody is responding"), "frustrated");
  });

  it("reads gratitude", () => {
    assert.equal(heuristicSentiment("Thanks, that worked perfectly"), "positive");
  });

  it("defaults to neutral", () => {
    assert.equal(heuristicSentiment("What are your opening hours?"), "neutral");
  });

  it("pushes an explicit urgent outage past the R4 threshold", () => {
    const urgency = heuristicUrgency(
      "This is urgent, our production is down, we need this fixed immediately",
      "distressed",
    );
    assert.ok(urgency >= 80, `expected >= 80, got ${urgency}`);
  });

  it("keeps a routine question under the threshold", () => {
    assert.ok(heuristicUrgency("What are your hours on Saturday?", "neutral") < 80);
  });
});

describe("openrouter provider failure path (AT-11)", () => {
  it("reports a missing key instead of faking a success", async () => {
    const outcome = await classifyAndDraft({
      business: BUSINESS_A.facts,
      query: "What is the price of the Pro Plan?",
      retrieved: searchMarkdownRag(chunksA, "Pro Plan price"),
      env: { LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "" },
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.provider, "openrouter");
      assert.match(outcome.error, /OPENROUTER_API_KEY/);
    }
  });
});

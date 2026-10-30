import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BUSINESS_A, BUSINESS_B } from "../../../src/data/seed-facts.ts";
import { chunkMarkdown, compileBrainMd, searchMarkdownRag } from "../../../src/server/ai/rag.ts";
import { groundVoiceAnswer, spokenFacts, UNGROUNDED_REPLY } from "../../../src/server/voice/grounding.ts";
import type { BrainChunk } from "../../../src/shared/domain.ts";

function buildChunks(business: typeof BUSINESS_A): BrainChunk[] {
  return chunkMarkdown(compileBrainMd(business.facts)).map((draft, index) => ({
    ...draft,
    id: `chk_${business.chunkPrefix}_${String(index + 1).padStart(2, "0")}`,
    chunkIndex: index,
  }));
}

const chunksA = buildChunks(BUSINESS_A);
const chunksB = buildChunks(BUSINESS_B);

const PRO_PLAN_QUESTION = "What is the price of the Pro Plan and does it include WhatsApp invoicing?";

describe("groundVoiceAnswer — the same floor as text", () => {
  it("refuses the other tenant's question instead of speaking its price list", () => {
    const answer = groundVoiceAnswer(PRO_PLAN_QUESTION, searchMarkdownRag(chunksB, PRO_PLAN_QUESTION, 4));

    assert.equal(answer.escalateToHuman, true);
    assert.ok(answer.confidenceScore < 50, `confidence ${answer.confidenceScore}`);
    assert.deepEqual(answer.citedChunkIds, []);
    assert.equal(answer.groundedFacts, UNGROUNDED_REPLY);
    assert.ok(!answer.groundedFacts.includes("₹1,200"), "the clinic's prices must not be spoken");
    assert.ok(!answer.groundedFacts.includes("₹4,500"), "the clinic's prices must not be spoken");
  });

  it("answers the owning tenant's question with the owning tenant's chunk", () => {
    const answer = groundVoiceAnswer(PRO_PLAN_QUESTION, searchMarkdownRag(chunksA, PRO_PLAN_QUESTION, 4));

    assert.ok(answer.confidenceScore >= 50, `confidence ${answer.confidenceScore}`);
    assert.equal(answer.escalateToHuman, false);
    assert.deepEqual(answer.citedChunkIds, ["chk_cp_02"]);
    assert.ok(answer.groundedFacts.includes("₹1,499"), answer.groundedFacts);
    assert.ok(!answer.groundedFacts.includes("Q:"), answer.groundedFacts);
  });

  it("speaks the answer to a FAQ pair, never the question", () => {
    const query = "What should I do after an extraction?";
    const answer = groundVoiceAnswer(query, searchMarkdownRag(chunksB, query, 4));

    assert.equal(answer.escalateToHuman, false);
    assert.deepEqual(answer.citedChunkIds, ["chk_js_05"]);
    assert.ok(answer.groundedFacts.startsWith("Bite on the gauze"), answer.groundedFacts);
  });

  it("answers a two-part question from the chunks that cover it", () => {
    const query = "What are your prices and hours?";
    const answer = groundVoiceAnswer(query, searchMarkdownRag(chunksB, query, 4));

    assert.equal(answer.escalateToHuman, false);
    assert.ok(answer.confidenceScore >= 50, `confidence ${answer.confidenceScore}`);
    assert.ok(answer.groundedFacts.includes("₹1,200"), answer.groundedFacts);
    assert.ok(answer.groundedFacts.includes("10:00 AM"), answer.groundedFacts);
    assert.ok(answer.citedChunkIds.length >= 1 && answer.citedChunkIds.length <= 2, String(answer.citedChunkIds));
  });

  it("escalates a question no chunk covers, with confidence 0", () => {
    const query = "Tell me something about your team";
    const answer = groundVoiceAnswer(query, searchMarkdownRag(chunksA, query, 4));

    assert.equal(answer.escalateToHuman, true);
    assert.equal(answer.confidenceScore, 0);
    assert.deepEqual(answer.citedChunkIds, []);
  });

  it("escalates when retrieval returned nothing at all", () => {
    const answer = groundVoiceAnswer("What is your refund policy?", []);

    assert.deepEqual(answer, {
      groundedFacts: UNGROUNDED_REPLY,
      citedChunkIds: [],
      confidenceScore: 0,
      escalateToHuman: true,
    });
  });

  it("only ever cites the chunks it was given and never claims more than 95", () => {
    const hits = searchMarkdownRag(chunksA, "refund policy invoices", 4);
    const available = new Set(hits.map((hit) => hit.id));
    const answer = groundVoiceAnswer("refund policy invoices", hits);

    assert.ok(answer.confidenceScore <= 95, `confidence ${answer.confidenceScore}`);
    for (const id of answer.citedChunkIds) {
      assert.ok(available.has(id), `${id} was not retrieved`);
    }
  });
  it("escalates rather than reading a question back when the chunk holds no answer", () => {
    const answer = groundVoiceAnswer("What is your refund policy?", [
      { id: "chk_q_01", section: "FAQs", content: "Q: What is your refund policy? Q: How do I cancel?", score: 9 },
    ]);

    assert.equal(answer.escalateToHuman, true);
    assert.deepEqual(answer.citedChunkIds, []);
    assert.equal(answer.groundedFacts, UNGROUNDED_REPLY);
  });

  it("never cites a chunk it cannot speak from", () => {
    const answer = groundVoiceAnswer("policy", [
      { id: "chk_e_01", section: "Return Policy", content: "   ", score: 9 },
    ]);

    assert.equal(answer.escalateToHuman, true);
    assert.deepEqual(answer.citedChunkIds, []);
    assert.equal(answer.groundedFacts, UNGROUNDED_REPLY);
  });
});

describe("spokenFacts", () => {
  it("drops a FAQ question and keeps the answer", () => {
    assert.equal(spokenFacts("", "Q: Same? A: Different."), "Different.");
  });

  it("returns nothing when the content is questions only", () => {
    assert.equal(spokenFacts("refund", "Q: What is your refund policy?"), "");
  });

  it("strips the A: marker and prefers the sentence that matches the question", () => {
    const content = "Q: What do I bring? A: Bring the invoice and the device. A: Bring a photo id.";
    assert.equal(spokenFacts("invoice device", content, 1), "Bring the invoice and the device.");
  });

  it("falls back to the first sentences when nothing overlaps", () => {
    assert.equal(spokenFacts("zzz", "First fact. Second fact.", 1), "First fact.");
  });
});

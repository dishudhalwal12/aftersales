import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BUSINESS_A, BUSINESS_B, BUSINESS_C } from "../../src/lib/seed-facts.ts";
import {
  bestSentences,
  chunkMarkdown,
  compileBrainMd,
  retrievalConfidence,
  searchMarkdownRag,
  stem,
  tokenize,
} from "../../src/lib/rag.ts";
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

describe("tokenize and stem", () => {
  it("folds price, prices and pricing onto one token", () => {
    assert.equal(stem("price"), stem("prices"));
    assert.equal(stem("prices"), stem("pricing"));
  });

  it("drops stopwords and one-character noise", () => {
    const tokens = tokenize("What is the price of the Pro Plan?");
    assert.ok(tokens.includes("pro"));
    assert.ok(tokens.includes("plan"));
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("is"));
  });

  it("keeps numeric price tokens so ₹1,499 stays searchable", () => {
    assert.ok(tokenize("The Pro Plan is ₹1,499 per month").includes("499"));
  });
});

describe("compileBrainMd", () => {
  const brain = compileBrainMd(BUSINESS_A.facts);

  it("starts with the business name as the document title", () => {
    assert.ok(brain.startsWith("# CloudPulse CRM — Business Brain"));
  });

  it("emits one ## section per populated fact", () => {
    for (const heading of ["Identity", "Products & Pricing", "Hours", "Return & Cancellation Policy", "FAQs", "Escalation & Contact"]) {
      assert.ok(brain.includes(`## ${heading}`), `missing section: ${heading}`);
    }
  });

  it("omits an empty uploaded-knowledge section", () => {
    assert.ok(!brain.includes("## Uploaded Knowledge"));
  });
});

describe("chunkMarkdown", () => {
  it("produces one chunk per section for a seeded business", () => {
    assert.equal(chunksA.length, 6);
    assert.deepEqual(
      chunksA.map((chunk) => chunk.section),
      ["Identity", "Products & Pricing", "Hours", "Return & Cancellation Policy", "FAQs", "Escalation & Contact"],
    );
  });

  it("keeps the PRD's documented chunk id for the pricing section", () => {
    const pricing = chunksA.find((chunk) => chunk.section === "Products & Pricing");
    assert.equal(pricing?.id, "chk_cp_02");
  });

  it("never emits a preamble chunk", () => {
    assert.ok(!chunksA.some((chunk) => chunk.section === "General"));
  });

  it("gives every chunk non-empty keywords", () => {
    for (const chunk of chunksA) assert.ok(chunk.keywords.length > 0, chunk.section);
  });

  it("splits an oversized section without dropping text", () => {
    const long = `## Long\n\n${Array.from({ length: 40 }, (_, i) => `Sentence number ${i} explains a distinct detail.`).join(" ")}`;
    const pieces = chunkMarkdown(long, 40);
    assert.ok(pieces.length > 1);
    const rejoined = pieces.map((piece) => piece.content).join(" ");
    for (let i = 0; i < 40; i += 1) assert.ok(rejoined.includes(`Sentence number ${i} `));
  });

  it("returns nothing for an empty document", () => {
    assert.deepEqual(chunkMarkdown("   "), []);
  });

  it("falls back to a General chunk for markdown with no headings", () => {
    const [only] = chunkMarkdown("Just one paragraph of facts with no heading at all.");
    assert.equal(only?.section, "General");
  });
});

describe("searchMarkdownRag — tenant scoping", () => {
  it("answers the Pro Plan question from Business A's own pricing chunk", () => {
    const hits = searchMarkdownRag(chunksA, "What is the price of the Pro Plan and does it include WhatsApp invoicing?");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]?.id, "chk_cp_02");
  });

  it("returns only ids that belong to the chunk set it was given", () => {
    const hits = searchMarkdownRag(chunksA, "root canal ceramic crown");
    const allowed = new Set(chunksA.map((chunk) => chunk.id));
    for (const hit of hits) assert.ok(allowed.has(hit.id));
  });

  it("finds nothing when the question is outside the corpus", () => {
    assert.deepEqual(searchMarkdownRag(chunksB, "Can CloudPulse sync with my Tally ledger?"), []);
  });

  it("never lets one tenant's chunk ids leak into another tenant's search", () => {
    const hits = searchMarkdownRag(chunksB, "What is the price of the Pro Plan?");
    for (const hit of hits) assert.ok(hit.id.startsWith("chk_js_"), hit.id);
  });

  it("is deterministic", () => {
    const first = searchMarkdownRag(chunksA, "refund after cancellation");
    const second = searchMarkdownRag(chunksA, "refund after cancellation");
    assert.deepEqual(first, second);
  });

  it("honours topK", () => {
    assert.equal(searchMarkdownRag(chunksA, "plan price hours refund faq contact", 1).length, 1);
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchMarkdownRag(chunksA, "   "), []);
  });

  it("returns nothing when the business has no chunks", () => {
    assert.deepEqual(searchMarkdownRag([], "anything at all"), []);
  });
});

describe("retrievalConfidence — the offline floor", () => {
  it("is high when the chunks answer the question", () => {
    const query = "What is the price of the Pro Plan and does it include WhatsApp invoicing?";
    const confidence = retrievalConfidence(query, searchMarkdownRag(chunksA, query));
    assert.ok(confidence >= 50, `expected >= 50, got ${confidence}`);
  });

  it("stays below 50 when a different tenant is asked the same question", () => {
    const query = "What is the price of the Pro Plan and does it include WhatsApp invoicing?";
    const confidence = retrievalConfidence(query, searchMarkdownRag(chunksB, query));
    assert.ok(confidence < 50, `expected < 50, got ${confidence}`);
  });

  it("covers a two-part question across two sections", () => {
    const query = "What are your prices and hours?";
    assert.ok(retrievalConfidence(query, searchMarkdownRag(chunksA, query)) >= 50);
    assert.ok(retrievalConfidence(query, searchMarkdownRag(chunksB, query)) >= 50);
  });

  it("returns zero when nothing was retrieved", () => {
    assert.equal(retrievalConfidence("anything", []), 0);
  });

  it("returns zero for a query made only of stopwords", () => {
    assert.equal(retrievalConfidence("the and of", chunksA), 0);
  });

  it("refuses to be confident on a single incidental shared token", () => {
    const query = "Do you accept Bitcoin payments in Antarctica?";
    assert.ok(retrievalConfidence(query, searchMarkdownRag(chunksA, query)) < 50);
  });

  it("is capped so the offline provider never claims certainty", () => {
    const query = "How do I export GSTR-1?";
    assert.ok(retrievalConfidence(query, searchMarkdownRag(chunksA, query)) <= 95);
  });
});

describe("bestSentences", () => {
  it("prefers the sentence that carries the question's terms", () => {
    const sentence = bestSentences("root canal price", BUSINESS_B.facts.productsServices, 1);
    assert.ok(sentence.includes("Root Canal"), sentence);
  });

  it("falls back to the first sentences when nothing overlaps", () => {
    const sentence = bestSentences("zzz", "First fact. Second fact.", 1);
    assert.equal(sentence, "First fact.");
  });
});

describe("seeded corpora stay separate", () => {
  it("gives each business a distinct chunk id namespace", () => {
    const prefixes = new Set(
      [BUSINESS_A, BUSINESS_B, BUSINESS_C].map((business) => `chk_${business.chunkPrefix}_`),
    );
    assert.equal(prefixes.size, 3);
  });
});

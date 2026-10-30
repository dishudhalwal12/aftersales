/**
 * Business brain: compile -> chunk -> retrieve.
 *
 * Pure and dependency-free so `node --test` runs it with no bundler and no
 * database. Every function is deterministic: the same business facts always
 * produce the same chunks, which is what makes a citation reproducible.
 */

import type { BrainChunk, BusinessFacts, ChunkDraft, RetrievedChunk } from "../../shared/domain.ts";

const MAX_CHUNK_WORDS = 220;
const KEYWORD_LIMIT = 60;

const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below
   between both but by can cannot could did do does doing down during each few for from further had has
   have having he her here hers herself him himself his how i if in into is it its itself just me more
   most my myself no nor not of off on once only or other our ours ourselves out over own same she should
   so some such than that the their theirs them themselves then there these they this those through to too
   under until up very was we were what when where which while who whom why will with would you your yours
   yourself yourselves please hi hello hey dear sir madam thanks thank kindly let us tell give know want
   need also may might must shall`
    .split(/\s+/)
    .filter(Boolean),
);

/** Light suffix folding. "prices"/"pricing"/"price" must land on one token. */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) {
    const base = token.slice(0, -3);
    return base.endsWith("ll") ? base.slice(0, -1) : base;
  }
  if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  if (token.length > 4 && token.endsWith("e")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((raw) => raw.length > 1 && !STOPWORDS.has(raw))
    .map(stem)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function keywordsFor(content: string, section: string): string {
  const counts = new Map<string, number>();
  for (const token of tokenize(`${section} ${section} ${content}`)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, KEYWORD_LIMIT)
    .map(([token]) => token)
    .join(",");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split an oversized section on paragraph boundaries, then on sentences when a
 * single paragraph is still too long. Never drops text.
 */
function splitSection(body: string): string[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  let buffer: string[] = [];
  let bufferedWords = 0;

  const flush = () => {
    if (buffer.length > 0) {
      pieces.push(buffer.join("\n\n"));
      buffer = [];
      bufferedWords = 0;
    }
  };

  for (const paragraph of paragraphs) {
    const words = wordCount(paragraph);
    if (words > MAX_CHUNK_WORDS) {
      flush();
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let sentenceBuffer: string[] = [];
      let sentenceWords = 0;
      for (const sentence of sentences) {
        const count = wordCount(sentence);
        if (sentenceWords + count > MAX_CHUNK_WORDS && sentenceBuffer.length > 0) {
          pieces.push(sentenceBuffer.join(" "));
          sentenceBuffer = [];
          sentenceWords = 0;
        }
        sentenceBuffer.push(sentence);
        sentenceWords += count;
      }
      if (sentenceBuffer.length > 0) pieces.push(sentenceBuffer.join(" "));
      continue;
    }

    if (bufferedWords + words > MAX_CHUNK_WORDS && buffer.length > 0) flush();
    buffer.push(paragraph);
    bufferedWords += words;
  }
  flush();
  return pieces;
}

/** Normalize business facts into the versioned `business_brain.md`. */
export function compileBrainMd(facts: BusinessFacts): string {
  const sections: Array<[string, string]> = [
    ["Identity", `${facts.description}\n\nBusiness type: ${facts.businessType}. Agent tone: ${facts.agentTone}.`],
    ["Products & Pricing", facts.productsServices],
    ["Hours", facts.hours],
    ["Return & Cancellation Policy", facts.returnPolicy],
    ["FAQs", facts.faqs],
    [
      "Escalation & Contact",
      `A human from ${facts.name} can be reached at ${facts.escalationEmail} or ${facts.escalationPhone}.`,
    ],
    ["Uploaded Knowledge", facts.rawMarkdownUpload],
  ];

  const header = `# ${facts.name} — Business Brain\n\n_Business type: ${facts.businessType} · Compiled by AfterSales AI._\n`;
  const body = sections
    .filter(([, content]) => content.trim().length > 0)
    .map(([heading, content]) => `## ${heading}\n\n${content.trim()}\n`)
    .join("\n");

  return `${header}\n${body}`;
}

/** Split a compiled markdown brain into citable, section-labelled chunks. */
export function chunkMarkdown(markdown: string, maxWords = MAX_CHUNK_WORDS): ChunkDraft[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const lines = normalized.split("\n");
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } = { heading: "General", body: [] };
  let sawHeading = false;

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading?.[1]) {
      // Everything before the first `##` is document preamble, not a section.
      if (sawHeading && current.body.join("\n").trim().length > 0) sections.push(current);
      current = { heading: heading[1].trim(), body: [] };
      sawHeading = true;
      continue;
    }
    if (/^#\s+/.test(line)) continue; // document title, not a section
    current.body.push(line);
  }
  if (sawHeading || current.body.join("\n").trim().length > 0) sections.push(current);

  const drafts: ChunkDraft[] = [];
  for (const section of sections) {
    const body = section.body.join("\n").trim();
    if (body.length === 0) continue;
    for (const piece of splitSection(body)) {
      drafts.push({
        section: section.heading,
        content: piece,
        keywords: keywordsFor(piece, section.heading),
      });
    }
  }
  return drafts;
}

export interface ChunkIndex {
  chunk: BrainChunk;
  tokens: Map<string, number>;
  length: number;
}

function buildIndex(chunk: BrainChunk): ChunkIndex {
  const tokens = new Map<string, number>();
  // The section heading is counted twice: a heading match should outrank an
  // incidental body match for the same term.
  for (const token of tokenize(`${chunk.section} ${chunk.section} ${chunk.content}`)) {
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  let length = 0;
  for (const count of tokens.values()) length += count;
  return { chunk, tokens, length };
}

const K1 = 1.4;
const B = 0.72;

/**
 * BM25 over one business's chunks. The caller must pass only that business's
 * chunks — tenant scoping is enforced by the query, not by this function.
 */
export function searchMarkdownRag(
  chunks: readonly BrainChunk[],
  query: string,
  topK = 4,
  minScore = 0.005,
): RetrievedChunk[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || chunks.length === 0) return [];

  const index = chunks.map(buildIndex);
  const avgLength = index.reduce((sum, doc) => sum + doc.length, 0) / index.length || 1;

  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    let df = 0;
    for (const doc of index) if (doc.tokens.has(token)) df += 1;
    documentFrequency.set(token, df);
  }

  const scored = index.map((doc) => {
    let score = 0;
    for (const token of queryTokens) {
      const tf = doc.tokens.get(token) ?? 0;
      if (tf === 0) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (index.length - df + 0.5) / (df + 0.5));
      const norm = 1 - B + B * (doc.length / avgLength);
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
    }
    return {
      id: doc.chunk.id,
      section: doc.chunk.section,
      content: doc.chunk.content,
      score: Number(score.toFixed(4)),
    };
  });

  return scored
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, topK));
}

/**
 * Deterministic confidence for the offline provider: how much of the question's
 * content the retrieved chunks actually cover. Deliberately conservative —
 * a two-term question answered by only one term must land under the 50 floor.
 */
export function retrievalConfidence(
  query: string,
  chunks: ReadonlyArray<Pick<BrainChunk, "section" | "content">>,
): number {
  const queryTokens = [...new Set(tokenize(query))].filter((token) => token.length > 2);
  if (queryTokens.length === 0 || chunks.length === 0) return 0;

  const tokenSet = (chunk: Pick<BrainChunk, "section" | "content">) =>
    new Set(tokenize(`${chunk.section} ${chunk.content}`));

  const topTokens = tokenSet(chunks[0] as Pick<BrainChunk, "section" | "content">);
  const unionTokens = new Set<string>();
  for (const chunk of chunks.slice(0, 3)) {
    for (const token of tokenSet(chunk)) unionTokens.add(token);
  }

  const matched = queryTokens.filter((token) => unionTokens.has(token));
  // One shared token is a coincidence, not an answer.
  if (matched.length < 2 && queryTokens.length > 1) return Math.min(35, matched.length * 20);

  const topMatched = queryTokens.filter((token) => topTokens.has(token));
  const unionCoverage = matched.length / queryTokens.length;
  const topCoverage = topMatched.length / queryTokens.length;

  return Math.max(
    0,
    Math.min(95, Math.round(100 * Math.min(1, 0.95 * unionCoverage + 0.35 * topCoverage))),
  );
}

/** The most relevant sentence(s) of a chunk — used by the offline answer builder. */
export function bestSentences(query: string, content: string, limit = 2): string {
  const queryTokens = new Set(tokenize(query));
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^[-*•]\s*/, "").trim())
    .filter((sentence) => sentence.length > 0);

  const scored = sentences.map((sentence, position) => {
    const tokens = new Set(tokenize(sentence));
    let overlap = 0;
    for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
    return { sentence, position, overlap };
  });

  const best = scored
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.position - b.position)
    .slice(0, limit)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.sentence);

  return (best.length > 0 ? best : sentences.slice(0, limit)).join(" ");
}

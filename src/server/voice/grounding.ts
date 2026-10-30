/**
 * Voice grounding — the spoken answer's floor.
 *
 * The text path answers through `evaluateRoutingRules`, which refuses to send below
 * confidence 50 and refuses to send without a verified citation. The voice path used to
 * skip both: it turned any BM25 score into a confidence above 50 and read the top chunk
 * back to the caller. That is the one channel where a wrong answer is spoken out loud, so
 * it gets the same floor rather than its own arithmetic.
 *
 * Pure: no Prisma, no network, no request context — `node --test` covers it directly.
 */

import { retrievalConfidence, tokenize } from "../ai/rag.ts";
import type { RetrievedChunk } from "../../shared/domain.ts";

/** PRD §0: below this, the agent says it cannot help — it never guesses. */
export const VOICE_CONFIDENCE_FLOOR = 50;

/** What the agent says when nothing grounds an answer. The route adds who can help. */
export const UNGROUNDED_REPLY = "I do not have a grounded answer for that.";

export interface VoiceGrounding {
  groundedFacts: string;
  citedChunkIds: string[];
  confidenceScore: number;
  escalateToHuman: boolean;
}

/** Sentence-level facts for a voice turn: FAQ questions are dropped, answers are kept. */
export function spokenFacts(query: string, content: string, limit = 2): string {
  return spokenSentences(query, content, limit).join(" ");
}

const QUESTION_PREFIX = /^Q\s*[:.)\-]\s*/i;
const ANSWER_PREFIX = /^A\s*[:.)\-]\s*/i;

/**
 * A caller must never hear their own question read back, so `Q:` lines are dropped and
 * `A:` markers are stripped before ranking. When nothing survives, the raw content is
 * spoken rather than nothing at all.
 */
function spokenSentences(query: string, content: string, limit: number): string[] {
  const queryTokens = new Set(tokenize(query));
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !QUESTION_PREFIX.test(sentence))
    .map((sentence) => sentence.replace(ANSWER_PREFIX, "").trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    const raw = content.replace(/\s+/g, " ").trim();
    return raw.length === 0 ? [] : [raw];
  }

  const ranked = sentences
    .map((sentence, position) => {
      const tokens = new Set(tokenize(sentence));
      let overlap = 0;
      for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
      return { sentence, position, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || a.position - b.position);

  const matching = ranked.filter((entry) => entry.overlap > 0).slice(0, limit);
  const chosen = matching.length > 0 ? matching : ranked.slice(0, limit);
  return chosen.sort((a, b) => a.position - b.position).map((entry) => entry.sentence);
}

function coveredBy(chunk: RetrievedChunk): Set<string> {
  return new Set(tokenize(`${chunk.section} ${chunk.content}`));
}

/**
 * Ground one voice question in this business's retrieved chunks.
 *
 * `confidenceScore` is the same deterministic measure the offline text provider uses, so
 * "the clinic was asked about the Pro Plan" scores the same on both channels. The cited
 * chunks are chosen by coverage of the question — a chunk that shares only a section word
 * is not "the answer" — and nothing outside `hits` is ever cited.
 */
export function groundVoiceAnswer(
  query: string,
  hits: readonly RetrievedChunk[],
): VoiceGrounding {
  if (hits.length === 0) {
    return {
      groundedFacts: UNGROUNDED_REPLY,
      citedChunkIds: [],
      confidenceScore: 0,
      escalateToHuman: true,
    };
  }

  const confidenceScore = retrievalConfidence(query, hits);
  const queryTokens = [...new Set(tokenize(query))];

  const ranked = hits
    .map((hit) => {
      const tokens = coveredBy(hit);
      const coverage = queryTokens.filter((token) => tokens.has(token)).length;
      return { hit, tokens, coverage };
    })
    .sort((a, b) => b.coverage - a.coverage || b.hit.score - a.hit.score);

  const covered = new Set<string>();
  const selected: RetrievedChunk[] = [];
  for (const entry of ranked) {
    const adds = queryTokens.some((token) => entry.tokens.has(token) && !covered.has(token));
    if (!adds) continue;
    selected.push(entry.hit);
    for (const token of queryTokens) if (entry.tokens.has(token)) covered.add(token);
    if (selected.length === 2) break;
  }

  if (confidenceScore < VOICE_CONFIDENCE_FLOOR || selected.length === 0) {
    return {
      groundedFacts: UNGROUNDED_REPLY,
      citedChunkIds: [],
      confidenceScore,
      escalateToHuman: true,
    };
  }

  const facts = selected
    .map((chunk) => spokenFacts(query, chunk.content, 1))
    .filter((sentence) => sentence.length > 0)
    .join(" ");

  return {
    groundedFacts: facts.length > 0 ? facts : UNGROUNDED_REPLY,
    citedChunkIds: selected.map((chunk) => chunk.id),
    confidenceScore,
    escalateToHuman: facts.length === 0,
  };
}

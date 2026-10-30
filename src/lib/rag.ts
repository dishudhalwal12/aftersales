// Business Brain compiler, chunker, and business-scoped retrieval.

import { prisma } from "./db";

export const CHUNK_MIN_WORDS = 150;
export const CHUNK_MAX_WORDS = 300;

export type BusinessFacts = {
  name: string;
  businessType: string;
  description: string;
  productsServices: string;
  hours: string;
  returnPolicy: string;
  faqs: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone?: string;
  rawMarkdownUpload?: string;
};

export type CompiledChunk = {
  chunkIndex: number;
  section: string;
  content: string;
  keywords: string;
  wordCount: number;
};

export type CompiledBrain = {
  brainMd: string;
  chunks: CompiledChunk[];
};

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "our", "with", "that", "this", "are",
  "was", "were", "have", "has", "had", "not", "but", "from", "will", "can",
  "all", "any", "how", "what", "when", "where", "who", "why", "into", "than",
  "then", "them", "they", "their", "there", "these", "those", "been", "being",
  "about", "after", "before", "over", "under", "also", "just", "only", "very",
  "more", "most", "some", "such", "each", "per", "via", "use", "using", "used",
  "get", "got", "may", "might", "must", "should", "would", "could", "does",
  "did", "doing", "done", "its", "it's",
]);

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// FAQ input may be free text, "Q:/A:" pairs, a JSON array of strings, or a
// JSON array of { question, answer } / { q, a } objects. Normalize all of them
// into readable markdown so the chunker and LLM see the same structure.
function formatFaqs(faqs: string): string {
  const raw = normalizeLineBreaks(faqs);
  if (!raw) return "No FAQs provided.";

  const looksJson = raw.startsWith("[") || raw.startsWith("{");
  if (looksJson) {
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const lines = items
        .map((item) => {
          if (typeof item === "string") return `- ${item}`;
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            const question = record.question ?? record.q;
            const answer = record.answer ?? record.a;
            if (question && answer) return `- **Q:** ${question}\n  **A:** ${answer}`;
            if (question) return `- ${question}`;
          }
          return null;
        })
        .filter((line): line is string => Boolean(line));
      if (lines.length > 0) return lines.join("\n");
    } catch {
      // Not valid JSON after all — fall through to plain text.
    }
  }

  return raw;
}

function hasMarkdownSections(markdown: string): boolean {
  return /^##\s+\S/m.test(markdown);
}

export function compileBusinessBrain(facts: BusinessFacts): string {
  const tone = facts.agentTone?.trim() || "Warm, concise, and helpful";
  const header = [
    `# ${facts.name} — Business Brain`,
    "",
    `> Business type: ${facts.businessType}`,
    `> Assistant tone: ${tone}`,
    `> Source: AfterSales AI onboarding · compiled ${new Date().toISOString()}`,
  ].join("\n");

  const sections = [
    ["Company Overview", normalizeLineBreaks(facts.description) || "No description provided."],
    ["Products & Pricing", normalizeLineBreaks(facts.productsServices) || "No pricing information provided."],
    ["Support Hours", normalizeLineBreaks(facts.hours) || "Support hours not provided."],
    ["Refund & Cancellation Policy", normalizeLineBreaks(facts.returnPolicy) || "No refund policy provided."],
    ["FAQs & Troubleshooting", formatFaqs(facts.faqs)],
    [
      "Escalation & Contact",
      [
        `Escalation email: ${facts.escalationEmail}`,
        `Escalation phone: ${facts.escalationPhone}`,
        `Preferred tone for customer replies: ${tone}`,
      ].join("\n"),
    ],
  ];

  const parts: string[] = [header];
  for (const [title, body] of sections) {
    parts.push(`## ${title}`, "", body, "");
  }

  const upload = facts.rawMarkdownUpload ? normalizeLineBreaks(facts.rawMarkdownUpload) : "";
  if (upload) {
    if (hasMarkdownSections(upload)) {
      parts.push(upload, "");
    } else {
      parts.push("## Additional Business Documentation", "", upload, "");
    }
  }

  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

type RawSection = { section: string; body: string };

function splitSections(markdown: string): RawSection[] {
  const lines = markdown.split("\n");
  const sections: RawSection[] = [];
  let currentTitle = "Overview";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ section: currentTitle, body });
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      currentTitle = heading[1].trim();
      continue;
    }
    if (/^#\s+/.test(line) || line.startsWith(">")) continue;
    buffer.push(line);
  }
  flush();

  return sections;
}

function splitOversizedParagraph(paragraph: string): string[] {
  if (countWords(paragraph) <= CHUNK_MAX_WORDS) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*|\S+$/g) ?? [paragraph];
  const slices: string[] = [];
  let current: string[] = [];

  const pushCurrent = () => {
    if (current.length) slices.push(current.join(" ").trim());
    current = [];
  };

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (sentenceWords > CHUNK_MAX_WORDS) {
      pushCurrent();
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length; i += CHUNK_MAX_WORDS) {
        slices.push(words.slice(i, i + CHUNK_MAX_WORDS).join(" "));
      }
      continue;
    }
    if (countWords(current.join(" ")) + sentenceWords > CHUNK_MAX_WORDS) pushCurrent();
    current.push(sentence.trim());
  }
  pushCurrent();

  return slices;
}

function chunkBody(body: string): string[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap(splitOversizedParagraph);

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);
    if (current.length > 0 && currentWords + paragraphWords > CHUNK_MAX_WORDS) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
    current.push(paragraph);
    currentWords += paragraphWords;
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));

  // Merge a tiny trailing chunk back into its predecessor when it fits, so we
  // avoid one-line chunks that hurt retrieval quality.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];
    const lastWords = countWords(last);
    if (lastWords < CHUNK_MIN_WORDS && countWords(previous) + lastWords <= CHUNK_MAX_WORDS) {
      chunks.splice(chunks.length - 2, 2, `${previous}\n\n${last}`);
    }
  }

  return chunks.length > 0 ? chunks : [body];
}

function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.filter(
    (token) => (token.length >= 3 || /^\d+$/.test(token)) && !STOPWORDS.has(token)
  );
}

export function extractKeywords(content: string, limit = 24): string {
  const counts = new Map<string, number>();

  for (const token of tokenize(content)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token)
    .join(",");
}

export function splitIntoChunks(markdown: string): CompiledChunk[] {
  const sections = splitSections(markdown);
  const chunks: CompiledChunk[] = [];
  let chunkIndex = 1;

  for (const { section, body } of sections) {
    for (const content of chunkBody(body)) {
      chunks.push({
        chunkIndex,
        section,
        content,
        keywords: extractKeywords(`${section} ${content}`),
        wordCount: countWords(content),
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}

export function buildBusinessBrain(facts: BusinessFacts): CompiledBrain {
  const brainMd = compileBusinessBrain(facts);
  return { brainMd, chunks: splitIntoChunks(brainMd) };
}

export type RankableChunk = {
  id: string;
  section: string;
  content: string;
  keywords: string;
};

export type RagSearchResult = RankableChunk & { score: number };

type ScoredDoc = {
  chunk: RankableChunk;
  termFrequency: Map<string, number>;
  length: number;
};

// BM25 over chunk content + section + stored keywords, with a section/keyword
// boost. Kept pure so retrieval ranking can be tested without a database.
export function rankChunks(
  chunks: RankableChunk[],
  query: string,
  topK = 4
): RagSearchResult[] {
  if (chunks.length === 0) return [];

  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const docs: ScoredDoc[] = chunks.map((chunk) => {
    const tokens = tokenize(
      `${chunk.section} ${chunk.section} ${chunk.keywords.replace(/,/g, " ")} ${chunk.content}`
    );
    const termFrequency = new Map<string, number>();
    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }
    return { chunk, termFrequency, length: tokens.length };
  });

  const averageLength =
    docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, docs.filter((doc) => doc.termFrequency.has(term)).length);
  }

  const k1 = 1.5;
  const b = 0.75;
  const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();

  const scored = docs
    .map((doc) => {
      let score = 0;

      for (const term of queryTerms) {
        const frequency = doc.termFrequency.get(term) ?? 0;
        if (frequency === 0) continue;
        const docFreq = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (docs.length - docFreq + 0.5) / (docFreq + 0.5));
        score +=
          idf *
          ((frequency * (k1 + 1)) /
            (frequency + k1 * (1 - b + b * (doc.length / averageLength))));
      }

      if (score === 0) return { chunk: doc.chunk, score };

      if (phrase.length > 6 && doc.chunk.content.toLowerCase().includes(phrase)) {
        score *= 1.35;
      }

      const storedKeywords = new Set(doc.chunk.keywords.split(","));
      const keywordHits = queryTerms.filter((term) => storedKeywords.has(term)).length;
      score += keywordHits * 0.35;

      return { chunk: doc.chunk, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b2) => b2.score - a.score || a.chunk.id.localeCompare(b2.chunk.id))
    .slice(0, topK);

  return scored.map(({ chunk, score }) => ({
    ...chunk,
    score: Math.round(score * 1000) / 1000,
  }));
}

// The ONLY retrieval entry point. The tenant filter lives in the SQL WHERE
// clause, so a query can never score another business's chunks.
export async function searchMarkdownRag(
  businessId: string,
  query: string,
  topK = 4
): Promise<RagSearchResult[]> {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { businessId },
    select: { id: true, section: true, content: true, keywords: true },
    orderBy: { chunkIndex: "asc" },
  });

  return rankChunks(chunks, query, topK);
}

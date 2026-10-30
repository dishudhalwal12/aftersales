// Business Brain compiler + chunker.
// Phase 1 only builds the versioned markdown and its chunks; retrieval
// (search_markdown_rag) is added in Phase 2.

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

export function extractKeywords(content: string, limit = 24): string {
  const tokens = content.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < 3 && !/^\d+$/.test(token)) continue;
    if (STOPWORDS.has(token)) continue;
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

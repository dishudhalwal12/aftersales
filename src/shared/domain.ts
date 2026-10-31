/**
 * Shared vocabulary for the AfterSales AI decision core.
 * Pure types only — this module imports nothing.
 */

export type Specialist = "general" | "technical" | "sales";

export type Sentiment = "positive" | "neutral" | "frustrated" | "distressed";

export type ActionStatus = "answered" | "draft" | "escalated" | "failed";

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";

export type TicketState = "new" | "triaged" | "replied" | "escalated" | "closed";

export type TicketChannel =
  | "TEXT_MODAL"
  | "WHATSAPP"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "GMAIL"
  | "VOICE";

/** Every channel the queue can filter by, in display order. */
export const TICKET_CHANNELS = [
  "TEXT_MODAL",
  "WHATSAPP",
  "FACEBOOK",
  "INSTAGRAM",
  "GMAIL",
  "VOICE",
] as const satisfies readonly TicketChannel[];

export function isTicketChannel(value: unknown): value is TicketChannel {
  return typeof value === "string" && (TICKET_CHANNELS as readonly string[]).includes(value);
}

/** The single structured object every classifier call must produce (PRD §4.2). */
export interface LlmResponse {
  specialist: Specialist;
  intent: string;
  sentiment: Sentiment;
  urgency_score: number;
  confidence_score: number;
  explicit_human_request: boolean;
  requires_human_judgment: boolean;
  cited_chunk_ids: string[];
  reply_text: string;
}

/**
 * Typed decisions from the local Laya model (`laya-service`), advisory only.
 *
 * Laya answers constrained questions — pick one option, score a rubric, judge a
 * proposition — in one bidirectional forward pass. It never writes a reply and it never
 * decides routing: R1–R7 keeps running on the classifier output alone, so a model this
 * new can add a second opinion without being able to change what happens to a customer.
 */
export type DecisionKind = "choice" | "score" | "noul";

export interface DecisionOption {
  label: string;
  probability: number;
}

export interface LayaDecision {
  /** Catalog id, e.g. `urgent_now`, `urgency`, `intent`. */
  id: string;
  kind: DecisionKind;
  title: string;
  /** The answer in words: `urgent`, `billing_question`, `blocking issue or hard deadline`. */
  verdict: string;
  /** noul: P(true) · choice: probability of the verdict · score: probability of the top band. */
  probability: number;
  /** 0..1 — the model's own confidence for this question (uncalibrated; see the model card). */
  confidence: number;
  /** score only: the expected level as a 0..1 fraction of the rubric. */
  value?: number;
  /** choice and score: every option the model chose between. Empty for a yes/no question. */
  options: DecisionOption[];
}

export interface DecisionSheet {
  provider: "laya-mlx";
  model: string;
  sheetVersion: number;
  latencyMs: number;
  decisions: LayaDecision[];
}

/** Why a ticket has no decision sheet; surfaced instead of an empty panel. */
export type DecisionSheetFailure = "not_configured" | "unreachable" | "timeout" | "rejected" | "invalid_response";

/** Everything the brain compiler needs from a business record. */
export interface BusinessFacts {
  name: string;
  businessType: string;
  description: string;
  productsServices: string;
  hours: string;
  returnPolicy: string;
  faqs: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  rawMarkdownUpload: string;
}

export interface ChunkDraft {
  section: string;
  content: string;
  keywords: string;
}

export interface BrainChunk extends ChunkDraft {
  id: string;
  chunkIndex: number;
}

export interface RetrievedChunk {
  id: string;
  section: string;
  content: string;
  score: number;
}

export interface RoutingDecision {
  ruleHit: RuleId;
  actionStatus: ActionStatus;
  ticketState: Extract<TicketState, "triaged" | "replied" | "escalated">;
  shouldAutoSend: boolean;
}

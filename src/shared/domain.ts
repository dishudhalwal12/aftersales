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

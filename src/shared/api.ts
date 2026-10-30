/** Response shapes shared by the API routes and the dashboard components. */

import type { ActionStatus, RuleId, Sentiment, Specialist } from "./domain.ts";

export interface BusinessSummary {
  businessId: string;
  name: string;
  businessType: string;
  brainVersion: number;
  autoSendEnabled: boolean;
  chunkCount: number;
  ticketCount: number;
}

export interface SourceCitation {
  chunkId: string;
  section: string;
  excerpt: string;
}

export interface TextQueryResponse {
  ticketId: string;
  businessId: string;
  specialist: Specialist;
  intent: string;
  sentiment: Sentiment;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: ActionStatus;
  routingRuleHit: RuleId;
  shouldAutoSend: boolean;
  answer: string;
  sources: SourceCitation[];
  provider: "openrouter" | "heuristic";
  degraded: boolean;
  classifierError: string | null;
}

export interface TicketSummary {
  ticketId: string;
  channel: string;
  customerName: string;
  customerHandle: string;
  customerQuery: string;
  state: string;
  specialistAssigned: string;
  intent: string;
  sentiment: string;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: string;
  routingRuleHit: string;
  aiDraftOrReply: string;
  citedChunkIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponse {
  businessId: string;
  count: number;
  tickets: TicketSummary[];
}

export interface TicketEvent {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface TicketDetailResponse {
  ticket: TicketSummary;
  events: TicketEvent[];
}

export interface RecurringComplaint {
  intent: string;
  count: number;
  negative: number;
  negativeShare: number;
  sample: string;
  lastSeen: string;
}

export interface InsightsResponse {
  businessId: string;
  windowDays: number;
  from: string;
  to: string;
  totalTickets: number;
  autoAnswered: number;
  drafts: number;
  escalated: number;
  failed: number;
  escalationRate: number;
  autoAnswerRate: number;
  sentiment: { positive: number; neutral: number; frustrated: number; distressed: number };
  busiestChannel: string | null;
  topRule: string | null;
  citations: number;
  recurringComplaints: RecurringComplaint[];
}

export interface BrainChunkView {
  chunkId: string;
  chunkIndex: number;
  section: string;
  content: string;
  keywords: string[];
}

export interface BrainResponse {
  businessId: string;
  businessName: string;
  brainVersion: number;
  compiledBrainMd: string;
  chunkCount: number;
  chunks: BrainChunkView[];
}

export interface ChannelStateResponse {
  provider: string;
  channel: string;
  configured: boolean;
  status: string;
  autoSend: boolean;
  transport: string;
}

export interface WebhookResponse {
  provider: string;
  duplicate: boolean;
  ticketId: string;
  routingRuleHit: string;
  actionStatus: string;
  shouldAutoSend: boolean;
  confidenceScore: number;
  specialist: string;
  answer: string;
  sources: SourceCitation[];
  degraded: boolean;
}

export interface VoiceSessionResponse {
  sessionId: string;
  businessId: string;
  businessName: string;
  demoPin: string;
  status: string;
  contextInjectionMode: string;
  callMode: "live" | "dry_run";
  callPlacementOk: boolean;
  callPlacementReason: string;
  sarvamConfigured: boolean;
  expiresAt: string;
}

export interface VoiceToolSearchResponse {
  businessName: string;
  groundedFacts: string;
  citedChunkIds: string[];
  confidenceScore: number;
  escalateToHuman: boolean;
  sessionId: string;
}

export interface VoiceWebhookResponse {
  sessionId: string;
  sessionStatus: string;
  escalationOutcome: string;
  ticketId: string;
  ticketState: string;
  actionStatus: string;
  routingRuleHit: string;
}

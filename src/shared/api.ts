/** Response shapes shared by the API routes and the dashboard components. */

import type {
  ActionStatus,
  DecisionSheet,
  DecisionSheetFailure,
  RuleId,
  Sentiment,
  Specialist,
} from "./domain.ts";

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
  /** Advisory typed decisions from the local Laya model; null when it did not answer. */
  decisionSheet: DecisionSheet | null;
  decisionSheetError: DecisionSheetFailure | null;
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
  /** Advisory typed decisions from the local Laya model; null when it did not answer. */
  decisionSheet: DecisionSheet | null;
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

export interface EmailStatusResponse {
  provider: string;
  configured: boolean;
  connected: boolean;
  status: "connected" | "disconnected" | "error";
  emailAddress: string | null;
  connectedAt: string | null;
  scopes: string[];
  autoSend: boolean;
  lastError: string | null;
  encryptionConfigured: boolean;
  oauthStateConfigured: boolean;
}

export type MetaChannelKind = "page" | "instagram";

export interface MetaChannelSummary {
  connected: boolean;
  status: "connected" | "disconnected" | "error";
  kind: MetaChannelKind | null;
  pageId: string | null;
  pageName: string | null;
  igUsername: string | null;
  connectedAt: string | null;
  lastError: string | null;
}

export interface MetaStatusResponse {
  configured: boolean;
  businessId: string;
  pendingSelection: boolean;
  pendingExpiresAt: string | null;
  facebook: MetaChannelSummary;
  instagram: MetaChannelSummary;
  encryptionConfigured: boolean;
  oauthStateConfigured: boolean;
}

export interface MetaAsset {
  kind: MetaChannelKind;
  id: string;
  name: string;
  username: string | null;
  pageId: string;
  pageName: string;
}

export interface MetaAssetsResponse {
  businessId: string;
  assets: MetaAsset[];
  pendingExpiresAt: string;
}

export type WhatsappConnectionStatus =
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "logged_out";

export interface WhatsappConnectionResponse {
  businessId: string;
  connectionId: string;
  status: WhatsappConnectionStatus;
  qr: string | null;
  qrExpiresAt: string | null;
  connectedAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  channelStatus: string;
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
  escalationOutcome: string | null;
  ticketId: string;
  ticketState: string;
  actionStatus: string;
  routingRuleHit: string;
  duplicate: boolean;
}

/** A persisted voice session, as the dashboard renders it after a reload. */
export interface VoiceSessionView {
  sessionId: string;
  status: string;
  demoPin: string;
  transcript: string | null;
  durationSeconds: number | null;
  escalationOutcome: string | null;
  createdAt: string;
}

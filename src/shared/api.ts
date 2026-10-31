/** Response shapes shared by the API routes and the dashboard components. */

import type {
  ActionStatus,
  DecisionSheet,
  DecisionSheetFailure,
  RuleId,
  Sentiment,
  Specialist,
} from "./domain.ts";

// Sent by the OAuth callback page to the dashboard window that opened it.
export const OAUTH_CALLBACK_MESSAGE_TYPE = "aftersales:oauth-callback";

export interface OAuthCallbackMessage {
  type: typeof OAUTH_CALLBACK_MESSAGE_TYPE;
  integration: "email" | "meta";
  status: string;
  businessId: string | null;
  error: string | null;
  message?: string | null;
  emailAddress?: string | null;
}

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

export type SentimentTrendLabel = "improving" | "stable" | "worsening" | "baseline";

export interface DailySentimentPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  total: number;
  negative: number;
  negativeShare: number;
}

export interface WeeklyComplaintView {
  intent: string;
  count: number;
  negative: number;
  negativeShare: number;
  previousCount: number;
  delta: number;
  direction: "new" | "rising" | "cooling" | "steady";
  sample: string;
  lastSeen: string;
}

/** One persisted completed-week report, with the provenance of its automatic run. */
export interface WeeklyReportView {
  weekStart: string;
  weekEnd: string;
  windowDays: number;
  totalTickets: number;
  autoAnswered: number;
  drafts: number;
  escalated: number;
  failed: number;
  escalationRate: number;
  autoAnswerRate: number;
  sentiment: { positive: number; neutral: number; frustrated: number; distressed: number };
  sentimentScore: number;
  previousScore: number | null;
  sentimentDelta: number;
  sentimentTrend: SentimentTrendLabel;
  dailySentiment: DailySentimentPoint[];
  recurringComplaints: WeeklyComplaintView[];
  topComplaint: string | null;
  citations: number;
  generatedAt: string;
  trigger: "cron" | "lazy";
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
  /** Rolling seven-day sentiment tracking, compared with the seven days before it. */
  sentimentScore: number;
  previousSentimentScore: number | null;
  sentimentDelta: number;
  sentimentTrend: SentimentTrendLabel;
  negativeShare: number;
  dailySentiment: DailySentimentPoint[];
  /** The latest persisted completed week, or null when persistence failed. */
  weeklyReport: WeeklyReportView | null;
  weeklyHistory: WeeklyReportView[];
  nextReportAt: string;
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

/** Owner-editable voice agent context (core facts + call-script fields + mapping). */
export interface VoiceAgentContextResponse {
  businessId: string;
  businessName: string;
  businessType: string;
  businessDescription: string;
  productsServices: string;
  openingHours: string;
  faqs: string;
  returnPolicy: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  businessAddress: string;
  weeklyHolidays: string[];
  supportedLanguages: string[];
  appointmentPolicy: string;
  agentInstructions: string;
  virtualNumber: string | null;
  agentId: string | null;
  isActive: boolean;
  updatedAt: string | null;
  brainVersion: number;
  chunkCount: number;
  recompiled?: boolean;
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

/** The per-type configuration row set an owner edits in the dashboard. */
export const VOICE_CUSTOMIZATION_TYPES = [
  "availability",
  "appointment_booking",
  "cancellation_policy",
  "rescheduling_policy",
  "callback_requests",
  "urgent_call_handling",
  "business_specific_instructions",
] as const;

export type VoiceCustomizationType = (typeof VOICE_CUSTOMIZATION_TYPES)[number];

export interface VoiceAvailabilityWindow {
  start: string;
  end: string;
}

export interface VoiceWeeklyDay {
  day: string;
  closed: boolean;
  windows: VoiceAvailabilityWindow[];
}

export interface VoiceDateOverride {
  date: string;
  closed: boolean;
  windows: VoiceAvailabilityWindow[];
  note: string;
}

export interface VoiceTemporaryClosure {
  from: string;
  to: string;
  reason: string;
}

export interface VoiceAvailabilityConfig {
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  maxPerSlot: number;
  minAdvanceHours: number;
  maxFutureDays: number;
  weekly: VoiceWeeklyDay[];
  dateOverrides: VoiceDateOverride[];
  temporaryClosures: VoiceTemporaryClosure[];
}

export interface VoiceAppointmentBookingConfig {
  bookingRules: string;
  noSlotBehavior: string;
  requiredDetails: string[];
}

export interface VoiceCancellationPolicyConfig {
  policyText: string;
  cutoffHours: number;
  feeNote: string;
}

export interface VoiceReschedulingPolicyConfig {
  policyText: string;
  cutoffHours: number;
  feeNote: string;
}

export interface VoiceCallbackRequestsConfig {
  instructions: string;
  collectPhone: boolean;
  responseWindow: string;
}

export interface VoiceUrgentCallConfig {
  instructions: string;
  emergencyInstructions: string;
  transferNumber: string | null;
  transferEnabled: boolean;
}

export interface VoiceBusinessInstructionsConfig {
  instructions: string;
}

export interface VoiceCustomizationConfigMap {
  availability: VoiceAvailabilityConfig;
  appointment_booking: VoiceAppointmentBookingConfig;
  cancellation_policy: VoiceCancellationPolicyConfig;
  rescheduling_policy: VoiceReschedulingPolicyConfig;
  callback_requests: VoiceCallbackRequestsConfig;
  urgent_call_handling: VoiceUrgentCallConfig;
  business_specific_instructions: VoiceBusinessInstructionsConfig;
}

export interface VoiceCustomizationEntry<T = unknown> {
  isEnabled: boolean;
  configuration: T;
  updatedAt: string | null;
}

export interface VoiceCustomizationsResponse {
  businessId: string;
  customizations: {
    [K in VoiceCustomizationType]: VoiceCustomizationEntry<VoiceCustomizationConfigMap[K]>;
  };
  saved?: VoiceCustomizationType[];
}

/** The reply to a captured appointment / cancellation / callback request. */
export interface VoiceRequestResponse {
  requestId: string | null;
  requestType: string;
  accepted: boolean;
  /** Literal false: nothing is booked or cancelled without a booking backend. */
  confirmed: false;
  pending: boolean;
  duplicate: boolean;
  intent: string;
  routingRuleHit: string;
  ticketState: string;
  actionStatus: string;
  message: string;
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

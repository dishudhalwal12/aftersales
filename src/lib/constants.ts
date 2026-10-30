export const DEMO_USER_EMAIL =
  process.env.DEMO_USER_EMAIL?.trim().toLowerCase() || "judge@sphinx.demo";
export const DEMO_USER_NAME = "Judge Demo";
export const DEMO_USER_PASSWORD = "demo1234";

export const CHANNEL_TYPES = [
  "WHATSAPP",
  "FACEBOOK",
  "INSTAGRAM",
  "GMAIL",
  "SARVAM_VOICE",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_STATUSES = ["CONNECTED", "TEST_MODE", "DRAFT_ONLY", "UNAVAILABLE"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const TICKET_STATES = ["new", "triaged", "replied", "escalated", "closed"] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export const SPECIALISTS = ["general", "technical", "sales"] as const;
export type Specialist = (typeof SPECIALISTS)[number];

export const SENTIMENTS = ["positive", "neutral", "frustrated", "distressed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const ACTION_STATUSES = ["answered", "draft", "escalated", "failed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ROUTING_RULES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7"] as const;
export type RoutingRule = (typeof ROUTING_RULES)[number];

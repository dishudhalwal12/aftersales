/**
 * Domain vocabulary for the PS 2.5 support agent.
 *
 * These are the only shapes the router, the state machines and the 6 MCP tools
 * may exchange. Constants are `as const` tuples rather than enums so the module
 * stays erasable-syntax only and the values stay inspectable at runtime.
 */

/** Laya intent vocabulary, frozen by the capability contract. */
export const INTENTS = ['general', 'technical', 'sales', 'human_escalation'] as const
export type Intent = (typeof INTENTS)[number]

/** Laya sentiment vocabulary (contract AQ-13 — our proposal, not the PS's). */
export const SENTIMENTS = ['positive', 'neutral', 'negative', 'distressed'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

/** Exactly the four fields the router reads. Anything else Laya returns is dropped. */
export type LayaRouteDecision = {
  readonly confidence_score: number
  readonly intent: Intent
  readonly urgency: number
  readonly sentiment: Sentiment
}

/** CALL spine: ringing -> laya_route -> specialist -> escalation -> human_takeover -> resolved. */
export const CALL_STATES = [
  'ringing',
  'laya_route',
  'specialist',
  'escalation',
  'human_takeover',
  'resolved',
  'missed',
] as const
export type CallState = (typeof CALL_STATES)[number]

/** TICKET spine: new -> triaged -> replied -> escalated -> closed. */
export const TICKET_STATES = ['new', 'triaged', 'replied', 'escalated', 'closed'] as const
export type TicketState = (typeof TICKET_STATES)[number]

/**
 * The routing table, R1..R7, as one pure and total function.
 *
 * First match wins, in contract order. Two rules carry the product promise:
 *   R2 — a confidence below 50 beeps a human instead of guessing.
 *   R7 — malformed Laya output fails safe to a beep, never to a silent reply.
 */

import { INTENTS, SENTIMENTS, type LayaRouteDecision } from './types.ts'

/** R2 fires strictly below this score. The floor itself is draft-only (R5). */
export const CONFIDENCE_BEEP_BELOW = 50
/** At or above this score an agent reply may be sent without the owner (R6). */
export const CONFIDENCE_AUTO_SEND_AT = 70
/** At or above this urgency a contact beeps the owner regardless of confidence (R4). */
export const URGENCY_BEEP_AT = 80

export type RoutingRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7'

/**
 * Why a human was called. The first four are the contract's `escalate_to_human`
 * reasons; the last two are the fail-safe reasons this router needs to be total.
 */
export type EscalationReason =
  | 'explicit_request'
  | 'low_confidence'
  | 'distressed'
  | 'urgent'
  | 'invalid_decision'
  | 'router_error'

/** What the pipeline does next. `rule` is the reason code the dashboard shows (A5). */
export type RoutingDecision =
  | { readonly action: 'escalate'; readonly rule: RoutingRule; readonly reason: EscalationReason }
  | { readonly action: 'draft_only'; readonly rule: RoutingRule }
  | { readonly action: 'auto_reply'; readonly rule: RoutingRule }

const isScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)

/** Laya is an untrusted boundary: nothing is trusted until all four fields validate. */
const isRouteDecision = (value: unknown): value is LayaRouteDecision => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    isScore(candidate.confidence_score) &&
    isScore(candidate.urgency) &&
    isOneOf(candidate.intent, INTENTS) &&
    isOneOf(candidate.sentiment, SENTIMENTS)
  )
}

const escalate = (reason: EscalationReason, rule: RoutingRule): RoutingDecision => ({
  action: 'escalate',
  reason,
  rule,
})

export const route = (input: unknown): RoutingDecision => {
  if (!isRouteDecision(input)) return escalate('invalid_decision', 'R7')

  if (input.intent === 'human_escalation') return escalate('explicit_request', 'R1')
  if (input.confidence_score < CONFIDENCE_BEEP_BELOW) return escalate('low_confidence', 'R2')
  if (input.sentiment === 'distressed') return escalate('distressed', 'R3')
  if (input.urgency >= URGENCY_BEEP_AT) return escalate('urgent', 'R4')
  if (input.confidence_score < CONFIDENCE_AUTO_SEND_AT) return { action: 'draft_only', rule: 'R5' }
  return { action: 'auto_reply', rule: 'R6' }
}

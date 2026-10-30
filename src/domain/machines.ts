/**
 * The two state machines, as data plus two pure transition functions.
 *
 * F8 is encoded here rather than in prose: the only transitions that may release
 * the live leg are the terminal ones, and no transition can change the leg id, so
 * a "call transfer" is not expressible — not merely discouraged.
 *
 * F9 is encoded the same way: there is no `escalated -> replied` edge, so an
 * escalated case cannot be auto-sent by any caller of this module.
 */

import type { CallState, TicketState } from './types.ts'

export type CallSession = {
  readonly callId: string
  readonly legId: string
  readonly state: CallState
  readonly legReleased: boolean
}

export type Ticket = {
  readonly ticketId: string
  readonly state: TicketState
}

export type TransitionError = 'ILLEGAL_TRANSITION'

export type TransitionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: TransitionError }

/** The only states that may hang up the customer's line. */
export const TERMINAL_CALL_STATES: readonly CallState[] = ['resolved', 'missed']
export const TERMINAL_TICKET_STATES: readonly TicketState[] = ['closed']

const CALL_NEXT: Readonly<Record<CallState, readonly CallState[]>> = {
  ringing: ['laya_route', 'missed'],
  laya_route: ['specialist', 'escalation'],
  specialist: ['escalation', 'resolved'],
  escalation: ['human_takeover', 'resolved'],
  human_takeover: ['resolved'],
  resolved: [],
  missed: [],
}

const TICKET_NEXT: Readonly<Record<TicketState, readonly TicketState[]>> = {
  new: ['triaged'],
  triaged: ['replied', 'escalated', 'closed'],
  replied: ['escalated', 'closed'],
  escalated: ['closed'],
  closed: [],
}

const releasesLeg = (state: CallState): boolean => TERMINAL_CALL_STATES.includes(state)

const illegal = <T>(): TransitionResult<T> => ({ ok: false, error: 'ILLEGAL_TRANSITION' })

export const transitionCall = (session: CallSession, to: CallState): TransitionResult<CallSession> => {
  const allowed = CALL_NEXT[session.state] ?? []
  if (!allowed.includes(to)) return illegal()

  return {
    ok: true,
    value: { ...session, state: to, legReleased: releasesLeg(to) },
  }
}

export const transitionTicket = (ticket: Ticket, to: TicketState): TransitionResult<Ticket> => {
  const allowed = TICKET_NEXT[ticket.state] ?? []
  if (!allowed.includes(to)) return illegal()

  return { ok: true, value: { ...ticket, state: to } }
}

/** F9 at the tool boundary: an escalated or closed case never permits an agent send. */
export const canAutoSend = (ticket: Ticket): boolean => ticket.state !== 'escalated' && ticket.state !== 'closed'

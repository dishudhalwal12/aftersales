import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TERMINAL_CALL_STATES,
  TERMINAL_TICKET_STATES,
  canAutoSend,
  transitionCall,
  transitionTicket,
  type CallSession,
  type Ticket,
} from '../../src/domain/machines.ts'
import type { CallState, TicketState } from '../../src/domain/types.ts'

const call = (over: Partial<CallSession> = {}): CallSession => ({
  callId: 'call_1',
  legId: 'leg_airtel_1',
  state: 'ringing',
  legReleased: false,
  ...over,
})

const ticket = (over: Partial<Ticket> = {}): Ticket => ({ ticketId: 'tkt_1', state: 'new', ...over })

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(`expected a legal transition, got ${result.error}`)
  return result.value
}

// --- CALL spine: ringing -> laya_route -> specialist -> escalation -> human_takeover -> resolved

test('CALL follows the contract spine end to end', () => {
  const steps = ['laya_route', 'specialist', 'escalation', 'human_takeover', 'resolved'] as const
  let current: CallSession = call()
  for (const next of steps) current = unwrap(transitionCall(current, next))
  assert.equal(current.state, 'resolved')
  assert.equal(current.legReleased, true)
})

test('CALL never drops the live leg before it resolves', () => {
  // Arrange
  const spine = ['laya_route', 'specialist', 'escalation', 'human_takeover'] as const
  let current: CallSession = call()

  // Act + Assert: F8 — the beep must never hang up on the customer
  for (const next of spine) {
    current = unwrap(transitionCall(current, next))
    assert.equal(current.legReleased, false, `leg released while entering ${next}`)
  }
})

test('CALL preserves the same call leg across every transition — no transfer, no second number', () => {
  const spine = ['laya_route', 'specialist', 'escalation', 'human_takeover', 'resolved'] as const
  let current: CallSession = call()
  for (const next of spine) {
    current = unwrap(transitionCall(current, next))
    assert.equal(current.legId, 'leg_airtel_1', `leg swapped on the way to ${next}`)
    assert.equal(current.callId, 'call_1')
  }
})

test('CALL treats an unanswered ring as missed and releases the leg', () => {
  const result = unwrap(transitionCall(call(), 'missed'))
  assert.equal(result.state, 'missed')
  assert.equal(result.legReleased, true)
})

test('CALL lets the specialist resolve without a human', () => {
  const routed = unwrap(transitionCall(call(), 'laya_route'))
  const specialist = unwrap(transitionCall(routed, 'specialist'))
  const resolved = unwrap(transitionCall(specialist, 'resolved'))
  assert.equal(resolved.state, 'resolved')
  assert.equal(resolved.legReleased, true)
})

test('CALL fails safe to escalation when routing fails, skipping the specialist', () => {
  const routed = unwrap(transitionCall(call(), 'laya_route'))
  const result = unwrap(transitionCall(routed, 'escalation'))
  assert.equal(result.state, 'escalation')
  assert.equal(result.legReleased, false)
})

test('CALL lets a customer hang up during the beep without stranding the line', () => {
  const escalated = unwrap(transitionCall(unwrap(transitionCall(call(), 'laya_route')), 'escalation'))
  const result = unwrap(transitionCall(escalated, 'resolved'))
  assert.equal(result.state, 'resolved')
  assert.equal(result.legReleased, true)
})

test('CALL rejects ringing straight to specialist', () => {
  assert.deepEqual(transitionCall(call(), 'specialist'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('CALL rejects takeover before escalation', () => {
  assert.deepEqual(transitionCall(call({ state: 'specialist' }), 'human_takeover'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('CALL rejects handing the line back from the human to the AI', () => {
  assert.deepEqual(transitionCall(call({ state: 'human_takeover' }), 'escalation'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('CALL treats resolved as terminal', () => {
  assert.deepEqual(transitionCall(call({ state: 'resolved', legReleased: true }), 'ringing'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('CALL treats missed as terminal', () => {
  assert.deepEqual(transitionCall(call({ state: 'missed', legReleased: true }), 'laya_route'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('CALL rejects a self-loop', () => {
  assert.deepEqual(transitionCall(call({ state: 'specialist' }), 'specialist'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('CALL is immutable — the rejected session is untouched and a legal transition returns a new object', () => {
  // Arrange
  const before = call()
  const snapshot = { ...before }

  // Act
  const after = unwrap(transitionCall(before, 'laya_route'))

  // Assert
  assert.deepEqual(before, snapshot)
  assert.notEqual(after, before)
})

test('TERMINAL_CALL_STATES names exactly the states that release the line', () => {
  assert.deepEqual([...TERMINAL_CALL_STATES].sort(), ['missed', 'resolved'])
})

// --- TICKET spine: new -> triaged -> replied -> escalated -> closed

test('TICKET follows the contract spine end to end', () => {
  let current: Ticket = ticket()
  for (const next of ['triaged', 'replied', 'escalated', 'closed'] as const) {
    current = unwrap(transitionTicket(current, next))
  }
  assert.equal(current.state, 'closed')
})

test('TICKET closes straight from triaged when nothing needs a reply', () => {
  const triaged = unwrap(transitionTicket(ticket(), 'triaged'))
  assert.equal(unwrap(transitionTicket(triaged, 'closed')).state, 'closed')
})

test('TICKET escalates from triaged without ever replying', () => {
  const triaged = unwrap(transitionTicket(ticket(), 'triaged'))
  const escalated = unwrap(transitionTicket(triaged, 'escalated'))
  assert.equal(escalated.state, 'escalated')
})

test('TICKET escalates a customer follow-up that arrives after the agent replied', () => {
  const triaged = unwrap(transitionTicket(ticket(), 'triaged'))
  const replied = unwrap(transitionTicket(triaged, 'replied'))
  assert.equal(unwrap(transitionTicket(replied, 'escalated')).state, 'escalated')
})

test('TICKET refuses to return from escalated to replied — an escalated case is never auto-sent', () => {
  const escalated = ticket({ state: 'escalated' })
  assert.deepEqual(transitionTicket(escalated, 'replied'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('TICKET refuses to skip triage', () => {
  assert.deepEqual(transitionTicket(ticket(), 'replied'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('TICKET refuses to escalate straight from new — the contract table has no such edge', () => {
  assert.deepEqual(transitionTicket(ticket(), 'escalated'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('TICKET refuses to reopen a closed case', () => {
  assert.deepEqual(transitionTicket(ticket({ state: 'closed' }), 'new'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('TICKET rejects a self-loop', () => {
  assert.deepEqual(transitionTicket(ticket({ state: 'triaged' }), 'triaged'), {
    ok: false,
    error: 'ILLEGAL_TRANSITION',
  })
})

test('TICKET is immutable — the input is untouched and a legal transition returns a new object', () => {
  const before = ticket()
  const snapshot = { ...before }
  const after = unwrap(transitionTicket(before, 'triaged'))
  assert.deepEqual(before, snapshot)
  assert.notEqual(after, before)
})

test('TERMINAL_TICKET_STATES names only closed', () => {
  assert.deepEqual([...TERMINAL_TICKET_STATES], ['closed'])
})

test('canAutoSend permits an agent send before escalation', () => {
  for (const state of ['new', 'triaged', 'replied'] as const) {
    assert.equal(canAutoSend(ticket({ state })), true, `${state} should permit an agent send`)
  }
})

test('canAutoSend forbids an agent send once a case is escalated or closed', () => {
  for (const state of ['escalated', 'closed'] as const) {
    assert.equal(canAutoSend(ticket({ state })), false, `${state} must not permit an agent send`)
  }
})

test('CALL fails safe on a corrupted stored state instead of throwing', () => {
  // A row read back from the store is untrusted: an unknown state must not crash the pipeline.
  const corrupted = { ...call(), state: 'on_hold' as CallState }
  assert.doesNotThrow(() => transitionCall(corrupted, 'resolved'))
  assert.deepEqual(transitionCall(corrupted, 'resolved'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

test('TICKET fails safe on a corrupted stored state instead of throwing', () => {
  const corrupted = { ...ticket(), state: 'pending' as TicketState }
  assert.doesNotThrow(() => transitionTicket(corrupted, 'triaged'))
  assert.deepEqual(transitionTicket(corrupted, 'triaged'), { ok: false, error: 'ILLEGAL_TRANSITION' })
})

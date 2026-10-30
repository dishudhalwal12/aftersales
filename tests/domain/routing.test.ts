import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CONFIDENCE_AUTO_SEND_AT,
  CONFIDENCE_BEEP_BELOW,
  URGENCY_BEEP_AT,
  route,
} from '../../src/domain/routing.ts'

const decision = (over: Partial<Record<'confidence_score' | 'intent' | 'urgency' | 'sentiment', unknown>> = {}) => ({
  confidence_score: 90,
  intent: 'general',
  urgency: 10,
  sentiment: 'neutral',
  ...over,
})

test('threshold constants match the routing table in the capability contract', () => {
  // Arrange / Act / Assert
  assert.equal(CONFIDENCE_BEEP_BELOW, 50)
  assert.equal(CONFIDENCE_AUTO_SEND_AT, 70)
  assert.equal(URGENCY_BEEP_AT, 80)
})

test('R1 escalates an explicit request for a human even when confidence is perfect', () => {
  const result = route(decision({ intent: 'human_escalation', confidence_score: 100, urgency: 0, sentiment: 'positive' }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R1', reason: 'explicit_request' })
})

test('R1 outranks R4 so an urgent human request reports the human reason, not urgency', () => {
  const result = route(decision({ intent: 'human_escalation', urgency: 99 }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R1', reason: 'explicit_request' })
})

test('R2 fires the low-confidence beep one point below the floor', () => {
  const result = route(decision({ confidence_score: 49 }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R2', reason: 'low_confidence' })
})

test('R2 does not fire at exactly the confidence floor — the floor itself is draft-only', () => {
  const result = route(decision({ confidence_score: 50 }))
  assert.deepEqual(result, { action: 'draft_only', rule: 'R5' })
})

test('R2 outranks R6 — a 0-confidence reply is never auto-sent', () => {
  const result = route(decision({ confidence_score: 0, intent: 'technical', urgency: 0 }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R2', reason: 'low_confidence' })
})

test('R3 escalates a distressed customer even when every other signal is perfect', () => {
  const result = route(decision({ sentiment: 'distressed' }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R3', reason: 'distressed' })
})

test('R4 escalates at exactly the urgency threshold', () => {
  const result = route(decision({ urgency: 80 }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R4', reason: 'urgent' })
})

test('R4 does not fire at the urgency threshold minus one', () => {
  const result = route(decision({ urgency: 79 }))
  assert.deepEqual(result, { action: 'auto_reply', rule: 'R6' })
})

test('R4 outranks R5 so an urgent mid-confidence contact reaches the human, not the draft pile', () => {
  const result = route(decision({ confidence_score: 60, urgency: 95 }))
  assert.deepEqual(result, { action: 'escalate', rule: 'R4', reason: 'urgent' })
})

test('R5 holds a mid-confidence reply as a draft at the floor', () => {
  assert.deepEqual(route(decision({ confidence_score: 50 })), { action: 'draft_only', rule: 'R5' })
})

test('R5 holds a mid-confidence reply as a draft one point below the auto-send threshold', () => {
  assert.deepEqual(route(decision({ confidence_score: 69 })), { action: 'draft_only', rule: 'R5' })
})

test('R6 auto-replies at exactly the auto-send threshold', () => {
  assert.deepEqual(route(decision({ confidence_score: 70 })), { action: 'auto_reply', rule: 'R6' })
})

for (const intent of ['general', 'technical', 'sales'] as const) {
  test(`R6 auto-replies on a confident, non-urgent ${intent} contact`, () => {
    const result = route(decision({ intent, confidence_score: 88, urgency: 20, sentiment: 'neutral' }))
    assert.deepEqual(result, { action: 'auto_reply', rule: 'R6' })
  })
}

test('R6 auto-replies on a confident negative-sentiment contact that is not distressed', () => {
  const result = route(decision({ sentiment: 'negative' }))
  assert.deepEqual(result, { action: 'auto_reply', rule: 'R6' })
})

test('R7 fails safe on a missing decision', () => {
  assert.deepEqual(route(undefined), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on a null decision', () => {
  assert.deepEqual(route(null), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe when a required field is missing', () => {
  assert.deepEqual(route({ confidence_score: 90, intent: 'general', urgency: 10 }), {
    action: 'escalate',
    rule: 'R7',
    reason: 'invalid_decision',
  })
})

test('R7 fails safe on an unknown intent', () => {
  assert.deepEqual(route(decision({ intent: 'billing' })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on an unknown sentiment', () => {
  assert.deepEqual(route(decision({ sentiment: 'angry' })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on a confidence above 100', () => {
  assert.deepEqual(route(decision({ confidence_score: 101 })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on a negative urgency', () => {
  assert.deepEqual(route(decision({ urgency: -1 })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on a fractional confidence, which violates the integer schema', () => {
  assert.deepEqual(route(decision({ confidence_score: 90.5 })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('R7 fails safe on a numeric string, which is a type violation not a coercion opportunity', () => {
  assert.deepEqual(route(decision({ urgency: '90' })), { action: 'escalate', rule: 'R7', reason: 'invalid_decision' })
})

test('route is total — it never throws for adversarial input', () => {
  const adversarial: unknown[] = [undefined, null, 0, '', 'decision', [], {}, { confidence_score: NaN, intent: 'general', urgency: 1, sentiment: 'neutral' }]
  for (const input of adversarial) {
    assert.doesNotThrow(() => route(input))
  }
})

test('route is pure — the same decision always produces the same result and mutates nothing', () => {
  const input = decision({ confidence_score: 42 })
  const snapshot = { ...input }
  const first = route(input)
  const second = route(input)
  assert.deepEqual(first, second)
  assert.deepEqual(input, snapshot)
})

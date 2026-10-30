import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TOOL_ERROR_CODES, fail, ok, type EnvelopeMeta } from '../../src/domain/envelope.ts'

const meta = (over: Partial<EnvelopeMeta> = {}): EnvelopeMeta => ({
  tool: 'get_customer_profile',
  latency_ms: 12,
  ticket_id: 'tkt_1',
  ...over,
})

test('ok wraps a payload in a typed success envelope', () => {
  // Arrange
  const data = { customer_id: 'cus_1', plan_tier: 'Pro' }

  // Act
  const envelope = ok(data, meta())

  // Assert
  assert.equal(envelope.success, true)
  assert.deepEqual(envelope.data, data)
  assert.equal(envelope.error, null)
  assert.deepEqual(envelope.meta, meta())
})

test('fail wraps a documented error code in a typed failure envelope with no data', () => {
  const envelope = fail('HUMAN_OWNED', 'ticket is escalated; the agent may not send', meta())
  assert.equal(envelope.success, false)
  assert.equal(envelope.data, null)
  assert.deepEqual(envelope.error, { code: 'HUMAN_OWNED', message: 'ticket is escalated; the agent may not send' })
})

test('success and failure envelopes narrow on the success flag', () => {
  const envelopes = [ok({ ok: true }, meta()), fail('EMPTY_KB', 'no chunks', meta())] as const
  for (const envelope of envelopes) {
    if (envelope.success) {
      assert.notEqual(envelope.data, null)
    } else {
      assert.equal(envelope.error.code, 'EMPTY_KB')
      assert.equal(envelope.data, null)
    }
  }
})

test('meta carries the tool name, latency and the ticket it belongs to', () => {
  assert.deepEqual(ok(1, meta({ tool: 'search_markdown_rag', latency_ms: 0 })).meta, {
    tool: 'search_markdown_rag',
    latency_ms: 0,
    ticket_id: 'tkt_1',
  })
})

test('meta allows a null ticket for a call-bound or profile-bound tool', () => {
  assert.equal(ok(1, meta({ tool: 'get_customer_profile', ticket_id: null })).meta.ticket_id, null)
})

test('envelopes are frozen so a caller cannot mutate a tool result in place', () => {
  const success = ok({ value: 1 }, meta())
  const failure = fail('NO_MATCH', 'nothing found', meta())
  assert.equal(Object.isFrozen(success), true)
  assert.equal(Object.isFrozen(success.meta), true)
  assert.equal(Object.isFrozen(failure), true)
  assert.equal(Object.isFrozen(failure.error), true)
})

test('the caller-supplied meta object is copied, never captured or frozen', () => {
  // Arrange
  const input = meta()

  // Act
  const envelope = ok(1, input)

  // Assert
  assert.equal(Object.isFrozen(input), false, 'ok() must not freeze caller state')
  assert.notEqual(envelope.meta, input, 'ok() must not alias caller state')
})

test('mutating the caller meta afterwards cannot change an already-built envelope', () => {
  // Deliberately untyped so the property stays writable in this test only.
  const input = { tool: 'a', latency_ms: 1, ticket_id: null }
  const envelope = ok(1, input)
  input.latency_ms = 999
  assert.equal(envelope.meta.latency_ms, 1)
})

test('every documented tool error code is accepted by fail', () => {
  assert.equal(TOOL_ERROR_CODES.length, 13)
  for (const code of TOOL_ERROR_CODES) {
    const envelope = fail(code, `handled ${code}`, meta())
    assert.equal(envelope.success, false)
    assert.equal(envelope.error.code, code)
  }
})

test('the error code vocabulary is exactly the one frozen in the capability contract', () => {
  assert.deepEqual([...TOOL_ERROR_CODES].sort(), [
    'AUDIO_DEVICE_MISSING',
    'EMPTY_KB',
    'HUMAN_OWNED',
    'IDENTIFIER_MISSING',
    'MEDIA_TOO_LARGE',
    'NOT_ON_WHATSAPP',
    'NO_LIVE_LEG',
    'NO_MATCH',
    'PERMISSION_DENIED',
    'SCOPE_MISSING',
    'SESSION_DOWN',
    'STORE_UNAVAILABLE',
    'THREAD_NOT_FOUND',
  ])
})

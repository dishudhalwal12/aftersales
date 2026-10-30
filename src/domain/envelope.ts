/**
 * The typed envelope every MCP tool returns: { success, data, error, meta }.
 *
 * Scope decision (approved): the envelope lives at the tool boundary only.
 * Domain functions stay pure and return bare values, so there is exactly one
 * unwrap point per tool and tests assert on values, not on wrappers.
 *
 * Envelopes are frozen on construction, and caller-supplied meta is copied,
 * so a tool result cannot be mutated or aliased after the fact.
 */

/** The failure vocabulary frozen in the capability contract — no ad-hoc codes. */
export const TOOL_ERROR_CODES = [
  'IDENTIFIER_MISSING',
  'NO_MATCH',
  'NOT_ON_WHATSAPP',
  'MEDIA_TOO_LARGE',
  'SESSION_DOWN',
  'EMPTY_KB',
  'STORE_UNAVAILABLE',
  'THREAD_NOT_FOUND',
  'PERMISSION_DENIED',
  'HUMAN_OWNED',
  'SCOPE_MISSING',
  'NO_LIVE_LEG',
  'AUDIO_DEVICE_MISSING',
] as const

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number]

/** Enough for the dashboard to attribute and time every tool call (A5). */
export type EnvelopeMeta = {
  readonly tool: string
  readonly latency_ms: number
  readonly ticket_id: string | null
}

export type ToolFailure = {
  readonly code: ToolErrorCode
  readonly message: string
}

export type Envelope<T> =
  | { readonly success: true; readonly data: T; readonly error: null; readonly meta: EnvelopeMeta }
  | { readonly success: false; readonly data: null; readonly error: ToolFailure; readonly meta: EnvelopeMeta }

const copyMeta = (meta: EnvelopeMeta): EnvelopeMeta =>
  Object.freeze({ tool: meta.tool, latency_ms: meta.latency_ms, ticket_id: meta.ticket_id })

export const ok = <T>(data: T, meta: EnvelopeMeta): Envelope<T> =>
  Object.freeze({ success: true as const, data, error: null, meta: copyMeta(meta) })

export const fail = (code: ToolErrorCode, message: string, meta: EnvelopeMeta): Envelope<never> =>
  Object.freeze({
    success: false as const,
    data: null,
    error: Object.freeze({ code, message }),
    meta: copyMeta(meta),
  })

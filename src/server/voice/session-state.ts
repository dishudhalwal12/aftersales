/**
 * Voice session state — the only place that may name a session status or an outcome.
 *
 * PRD §3 freezes both enums (`VoiceTestSession.status`, `escalationOutcome`). The dev tree had
 * grown two extra values (`test_mode`, `call_failed`) because a dry run and a failed call both
 * needed to say something. They do not: the call *mode* is a response field, and a failed call is
 * work the owner has to pick up. Keeping the mapping here means a new call path cannot invent a
 * third value without failing a test.
 *
 * Pure: no Prisma, no network.
 */

/** PRD §3 — the frozen `VoiceTestSession.status` values. */
export const VOICE_STATUSES = ["initiated", "ringing", "in_progress", "completed", "failed"] as const;
export type VoiceStatus = (typeof VOICE_STATUSES)[number];

/** PRD §3 — the frozen `VoiceTestSession.escalationOutcome` values. */
export const ESCALATION_OUTCOMES = ["resolved_by_ai", "escalated_to_owner"] as const;
export type EscalationOutcome = (typeof ESCALATION_OUTCOMES)[number];

export interface CallPlacement {
  mode: "live" | "dry_run";
  ok: boolean;
}

/**
 * Where a session stands right after the outbound call was requested.
 *
 * A dry run stays `initiated`: no call is in flight, and the API says so through `callMode` and
 * `sarvamConfigured`. Only a real request the platform rejected becomes `failed`.
 */
export function callPlacementStatus(call: CallPlacement, current: VoiceStatus): VoiceStatus {
  if (call.mode === "live" && !call.ok) return "failed";
  return current;
}

/**
 * The outcome a completion webhook records.
 *
 * A caller who asked for a human is escalated. So is a call that failed — a dropped call is
 * exactly the case the owner must not miss, and `status: "failed"` still distinguishes it.
 */
export function completionOutcome(input: { escalate: boolean; status: string }): EscalationOutcome {
  if (input.escalate) return "escalated_to_owner";
  if (input.status === "failed") return "escalated_to_owner";
  return "resolved_by_ai";
}

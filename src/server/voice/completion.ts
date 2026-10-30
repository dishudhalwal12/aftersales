/**
 * Voice call completion — what a finished call is allowed to claim.
 *
 * Two things a webhook must never take on trust: which chunks the caller cites, and how many
 * times the same call can be reported. The first is AT-09 (an auto-sent reply cites this
 * business's chunk), the second is AT-10 (a replay is not a second answer). Both live here so a
 * route cannot decide them differently.
 */

import type { ActionStatus, RuleId, TicketState } from "../../shared/domain.ts";

/**
 * Keep only citations that belong to this business's chunk set.
 *
 * The voice platform is an external caller; its `citedChunkIds` are evidence, not authority.
 */
export function verifiedCitations(value: unknown, valid: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const verified: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (!valid.has(entry)) continue;
    if (verified.includes(entry)) continue;
    verified.push(entry);
  }
  return verified;
}

/**
 * The idempotency key for a session's queue ticket: one call is one inbound conversation.
 *
 * PRD §3 defines `Ticket.externalMessageId` as the duplicate guard, so reusing it for voice
 * costs no schema change and gives replay safety for free.
 */
export function voiceMessageId(sessionId: string): string {
  return `voice:${sessionId}`;
}

export interface CompletionDecision {
  actionStatus: Extract<ActionStatus, "answered" | "draft" | "escalated">;
  state: Extract<TicketState, "triaged" | "replied" | "escalated">;
  rule: RuleId;
}

/**
 * The routing verdict written on the queue ticket a completed call creates.
 *
 * Voice reuses the text rules rather than inventing its own: R1 when the caller asked for a
 * person, R6 only when the call was grounded, and R2 when the platform reports no verified
 * citation — corpus ``< 50`` confidence or zero verified chunks, which PRD §4.3 escalates rather
 * than leaving in a draft queue nobody watches.
 */
export function completionDecision(input: { escalate: boolean; grounded: boolean }): CompletionDecision {
  if (input.escalate) return { actionStatus: "escalated", state: "escalated", rule: "R1" };
  if (input.grounded) return { actionStatus: "answered", state: "replied", rule: "R6" };
  return { actionStatus: "escalated", state: "escalated", rule: "R2" };
}

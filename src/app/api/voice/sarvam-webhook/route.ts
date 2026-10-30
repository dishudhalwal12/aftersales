import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import {
  assertWebhookSecret,
  handleVoiceCompletion,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

const completionSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required."),
  status: z.enum(["completed", "failed"]).default("completed"),
  sarvamInteractionId: z.string().trim().min(1).max(200).optional(),
  transcript: z.string().max(20_000).optional(),
  durationSeconds: z.number().int().min(0).max(6 * 60 * 60).optional(),
  callerRequestedHuman: z.boolean().optional(),
  resolved: z.boolean().optional(),
});

// Receives the call-completion payload, stores the transcript/duration, and
// opens an escalation ticket when the caller asked for a human or the call
// ended unresolved. Replayed callbacks never create a second ticket.
export async function POST(request: Request) {
  try {
    assertWebhookSecret(request.headers.get("x-sarvam-webhook-secret"));
    const body = completionSchema.parse(await parseJsonBody(request));

    const outcome = await handleVoiceCompletion(body);

    return jsonOk({
      sessionId: outcome.session.id,
      status: outcome.session.status,
      escalationOutcome: outcome.escalationOutcome,
      ticketId: outcome.ticketId,
      duplicateTicket: outcome.duplicateTicket,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

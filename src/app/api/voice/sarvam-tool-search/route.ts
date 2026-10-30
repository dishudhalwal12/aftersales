import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import {
  answerVoiceQuery,
  assertToolSecret,
  resolveVoiceSession,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

const toolSearchSchema = z
  .object({
    sessionId: z.string().trim().min(1).optional(),
    demoPin: z.string().trim().regex(/^\d{4}$/, "demoPin must be 4 digits.").optional(),
    callerPhone: z.string().trim().min(5).max(20).optional(),
    query: z.string().trim().min(1, "query is required.").max(1000),
  })
  .refine((data) => Boolean(data.sessionId || data.demoPin || data.callerPhone), {
    message: "sessionId, demoPin, or callerPhone is required.",
  });

// Called by the Sarvam agent mid-call. The business is resolved from the
// session row only; the request cannot choose a tenant.
export async function POST(request: Request) {
  try {
    assertToolSecret(request.headers.get("x-sarvam-tool-secret"));
    const body = toolSearchSchema.parse(await parseJsonBody(request));

    const session = await resolveVoiceSession({
      sessionId: body.sessionId,
      demoPin: body.demoPin,
      callerPhone: body.callerPhone,
    });

    if (!session) {
      throw new ApiError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "No active voice session matched this call."
      );
    }

    const grounding = await answerVoiceQuery(session.business, body.query);
    return jsonOk(grounding);
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { assertChannelAvailable } from "@/lib/channels";
import { prisma } from "@/lib/db";
import {
  SarvamError,
  createVoiceSession,
  startOutboundCall,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

const phonePattern = /^\+91[6-9]\d{9}$/;

const startSessionSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  judgePhone: z
    .string()
    .trim()
    .regex(phonePattern, "judgePhone must be an Indian mobile number in +91XXXXXXXXXX format."),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = startSessionSchema.parse(await parseJsonBody(request));
    const business = await assertBusinessOwnership(user.id, body.businessId);
    await assertChannelAvailable(business.id, "SARVAM_VOICE");

    const session = await createVoiceSession(business.id, body.judgePhone);

    try {
      const { interactionId } = await startOutboundCall(session, business);
      if (interactionId) {
        await prisma.voiceTestSession.update({
          where: { id: session.id },
          data: { sarvamInteractionId: interactionId },
        });
      }

      return jsonOk({
        sessionId: session.id,
        businessId: business.id,
        businessName: business.name,
        demoPin: session.demoPin,
        status: session.status,
        contextInjectionMode: "PER_CALL_VARIABLES",
      });
    } catch (error) {
      await prisma.voiceTestSession.update({
        where: { id: session.id },
        data: { status: "failed" },
      });

      if (error instanceof SarvamError) {
        const notConfigured = error.code === "NOT_CONFIGURED";
        throw new ApiError(
          notConfigured ? 503 : 502,
          notConfigured ? "SARVAM_NOT_CONFIGURED" : "VOICE_PROVIDER_ERROR",
          error.message,
          { sessionId: session.id, demoPin: session.demoPin, status: "failed" }
        );
      }

      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

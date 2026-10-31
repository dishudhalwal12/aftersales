import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db.ts";
import { placeOutboundCall, generateDemoPin, sarvamStatus } from "../../../../server/voice/sarvam.ts";
import { loadVoiceAgentContext, voiceCallContext } from "../../../../server/voice/context.ts";
import {
  buildCustomizationVariables,
  loadActiveCustomizations,
} from "../../../../server/voice/customizations.ts";
import { callPlacementStatus } from "../../../../server/voice/session-state.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

const SESSION_TTL_MINUTES = 10;

/**
 * POST /api/voice/start-session — PRD §5.3.
 * Binds the caller's phone and a 4-digit demo PIN to exactly one business, so the
 * shared virtual number can answer with the right facts on the next call.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);

    const businessId = requireString(body, "businessId", { max: 100 });
    const judgePhone = requireString(body, "judgePhone", { max: 20 });

    if (!/^\+[1-9]\d{7,14}$/.test(judgePhone)) {
      throw new HttpError(400, 'field "judgePhone" must be E.164, e.g. +919812345678');
    }

    const business = await loadOwnedBusiness(user.id, businessId);
    const contextRow = await loadVoiceAgentContext(business.id);
    const customizations = buildCustomizationVariables(await loadActiveCustomizations(business.id));
    const demoPin = generateDemoPin();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);

    const session = await prisma.voiceTestSession.create({
      data: {
        businessId: business.id,
        demoPin,
        judgePhone,
        status: "initiated",
        expiresAt,
      },
    });

    const call = await placeOutboundCall({
      phone: judgePhone,
      sessionId: session.id,
      businessName: business.name,
      demoPin,
      variables: voiceCallContext(business, contextRow, customizations),
    });

    const status = callPlacementStatus(call, "initiated");
    const updated = await prisma.voiceTestSession.update({
      where: { id: session.id },
      data: { status, sarvamInteractionId: call.interactionId },
    });

    return NextResponse.json({
      sessionId: updated.id,
      businessId: business.id,
      businessName: business.name,
      demoPin: updated.demoPin,
      status: updated.status,
      contextInjectionMode: "PER_CALL_VARIABLES",
      // Additive honesty fields: what actually happened to the call request.
      callMode: call.mode,
      callPlacementOk: call.ok,
      callPlacementReason: call.reason,
      sarvamConfigured: sarvamStatus().configured,
      expiresAt: updated.expiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

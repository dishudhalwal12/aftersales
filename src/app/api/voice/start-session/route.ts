import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.ts";
import { placeOutboundCall, buildCallVariables, generateDemoPin, sarvamStatus } from "../../../../lib/sarvam.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../lib/tenant.ts";

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
      variables: buildCallVariables(business),
    });

    const status = call.mode === "dry_run" ? "test_mode" : call.ok ? "initiated" : "failed";
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

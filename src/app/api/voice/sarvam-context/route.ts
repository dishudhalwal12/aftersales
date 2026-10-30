import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.ts";
import { buildCallVariables, sarvamStatus } from "../../../../lib/sarvam.ts";
import { HttpError, errorResponse, readJson } from "../../../../lib/tenant.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/sarvam-context — the variables the voice platform injects at
 * call start. Everything here is business-scoped; the shared number is never
 * mutated, only parameterised per call (PRD §1.3, Phase 1 spike).
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "";
    const demoPin = typeof body["demoPin"] === "string" ? body["demoPin"] : "";
    if (sessionId.length === 0 && demoPin.length === 0) {
      throw new HttpError(400, "sessionId or demoPin is required");
    }

    const session = await prisma.voiceTestSession.findFirst({
      where: {
        ...(sessionId.length > 0 ? { id: sessionId } : {}),
        ...(demoPin.length > 0 ? { demoPin } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { business: true },
    });

    if (!session) throw new HttpError(404, "voice session not found");

    const status = sarvamStatus();
    return NextResponse.json({
      sessionId: session.id,
      businessId: session.businessId,
      demoPin: session.demoPin,
      expiresAt: session.expiresAt.toISOString(),
      callMode: status.configured ? "live" : "dry_run",
      virtualNumber: status.virtualNumber,
      variables: buildCallVariables(session.business),
      language: "hi-IN/en-IN code-mixed (Hinglish)",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

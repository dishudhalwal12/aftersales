import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db.ts";
import { sarvamStatus } from "../../../../server/voice/sarvam.ts";
import {
  authorizeVoiceContext,
  composeVoiceContext,
  loadVoiceAgentContext,
  parseTrustedIdentifiers,
  resolveCallBusiness,
  voiceCallContextReport,
} from "../../../../server/voice/context.ts";
import {
  buildCustomizationVariables,
  loadActiveCustomizations,
  resolveAvailability,
} from "../../../../server/voice/customizations.ts";
import { HttpError, errorResponse, readJson } from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/sarvam-context — the on-start payload the Sarvam agent pulls
 * before its first turn.
 *
 * Two trusted paths, never a caller-supplied business id:
 *   1. `agentId` and/or `virtualNumber` — resolved through the owner-saved
 *      mapping; ambiguous, unmapped and inactive states are explicit errors.
 *   2. `sessionId` / `demoPin` — the existing demo binding for the single
 *      shared number.
 *
 * When SARVAM_CONTEXT_TOKEN (or SARVAM_WEBHOOK_TOKEN as fallback) is set, the
 * request must carry it in `x-saram-token`, `x-sarvam-token`,
 * `x-sarvam-context-token`, or `Authorization: Bearer`.
 */
export async function POST(request: Request) {
  try {
    const auth = authorizeVoiceContext(request.headers);
    if (auth.configured && !auth.authorized) {
      throw new HttpError(401, "missing or invalid voice context token");
    }

    const body = await readJson(request);
    const { agentId, virtualNumber } = parseTrustedIdentifiers(body);
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"].trim() : "";
    const demoPin = typeof body["demoPin"] === "string" ? body["demoPin"].trim() : "";

    const resolution = await resolveCallBusiness({ agentId, virtualNumber, sessionId, demoPin });
    const business = await prisma.business.findUnique({ where: { id: resolution.businessId } });
    if (!business) throw new HttpError(404, "business not found");

    const status = sarvamStatus();
    const warnings: string[] = [];
    if (!auth.configured) {
      warnings.push("SARVAM_CONTEXT_TOKEN is not set — this endpoint is running without shared-secret auth.");
    }

    const contextRow = await loadVoiceAgentContext(business.id);
    const active = await loadActiveCustomizations(business.id);
    const customizationVariables = buildCustomizationVariables(active);
    const availability =
      active.availability === null ? null : resolveAvailability(active.availability);

    if (active.appointmentBooking === null) {
      warnings.push(
        "Appointment booking is disabled or unconfigured — the agent may only take callback requests.",
      );
    }

    const call = voiceCallContextReport(business, contextRow, customizationVariables);
    for (const clip of call.clipped) {
      warnings.push(
        `variable "${clip.variable}" was shortened for the voice payload: ${clip.sourceCharacters} characters stored, ${clip.sentCharacters} sent.`,
      );
    }

    return NextResponse.json({
      // Kept for the existing session contract; null for identifier calls.
      sessionId: resolution.session?.id ?? null,
      demoPin: resolution.session?.demoPin ?? null,
      expiresAt: resolution.session?.expiresAt.toISOString() ?? null,
      businessId: business.id,
      resolvedBy: resolution.resolvedBy,
      callMode: status.configured ? "live" : "dry_run",
      virtualNumber: status.virtualNumber,
      variables: call.variables,
      context: composeVoiceContext(business, contextRow),
      customizations: {
        availability,
        timezone: active.availability?.timezone ?? null,
        appointmentBooking: active.appointmentBooking,
        cancellationPolicy: active.cancellationPolicy,
        reschedulingPolicy: active.reschedulingPolicy,
        callbackRequests: active.callbackRequests,
        urgentCallHandling: active.urgentCallHandling,
        businessInstructions: active.businessInstructions,
        appointmentMode: "request_only",
        bookingBackend: "none",
        dateSpecificOverridesRecurring: true,
      },
      language: "hi-IN/en-IN code-mixed (Hinglish)",
      contextAuth: auth.mode,
      warnings,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

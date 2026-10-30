import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.ts";
import { getCurrentUser } from "../../../../lib/auth.ts";
import { HttpError, errorResponse, readJson } from "../../../../lib/tenant.ts";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed"]);

function parseCitations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

/**
 * POST /api/voice/sarvam-webhook — call completion (PRD §6, Phase 4).
 *
 * Authenticated either by the voice platform's shared token or by the owner's
 * session (the dashboard simulator). A completed call is written back onto the
 * session and, when a human is needed, becomes a VOICE ticket in the same queue.
 */
export async function POST(request: Request) {
  try {
    const expectedToken = (process.env.SARVAM_WEBHOOK_TOKEN ?? "").trim();
    const providedToken = (request.headers.get("x-sarvam-token") ?? "").trim();
    const platformAuthorised = expectedToken.length > 0 && providedToken === expectedToken;
    const user = platformAuthorised ? null : await getCurrentUser();
    if (!platformAuthorised && user === null) throw new HttpError(401, "not authenticated");

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
    if (user !== null && session.business.ownerId !== user.id) {
      throw new HttpError(403, "forbidden: this session belongs to another tenant");
    }

    const requestedStatus = typeof body["status"] === "string" ? body["status"] : "completed";
    const status = TERMINAL.has(requestedStatus) ? requestedStatus : "completed";
    const transcript = typeof body["transcript"] === "string" ? body["transcript"].slice(0, 8000) : null;
    const durationRaw = body["durationSeconds"];
    const durationSeconds =
      typeof durationRaw === "number" && Number.isInteger(durationRaw) && durationRaw >= 0
        ? Math.min(durationRaw, 60 * 60 * 6)
        : null;
    const escalate = body["escalateToHuman"] === true;
    const citations = parseCitations(body["citedChunkIds"]);
    const interactionId = typeof body["interactionId"] === "string" ? body["interactionId"] : null;

    const escalationOutcome = escalate
      ? "escalated_to_owner"
      : status === "failed"
        ? "call_failed"
        : "resolved_by_ai";

    await prisma.voiceTestSession.update({
      where: { id: session.id },
      data: {
        status,
        transcript,
        durationSeconds,
        escalationOutcome,
        ...(interactionId !== null ? { sarvamInteractionId: interactionId } : {}),
      },
    });

    const grounded = citations.length > 0;
    const actionStatus = escalate ? "escalated" : grounded ? "answered" : "draft";
    const state = escalate ? "escalated" : grounded ? "replied" : "triaged";
    const rule = escalate ? "R1" : grounded ? "R6" : "R5";

    const ticket = await prisma.ticket.create({
      data: {
        businessId: session.businessId,
        channel: "VOICE",
        customerName: "Voice caller",
        customerHandle: session.judgePhone,
        customerQuery: transcript !== null && transcript.length > 0 ? transcript.slice(0, 500) : "Voice call",
        state,
        specialistAssigned: "general",
        intent: escalate ? "voice_escalation" : "voice_resolved",
        sentiment: escalate ? "frustrated" : "neutral",
        urgencyScore: escalate ? 85 : 30,
        confidenceScore: grounded ? 88 : 0,
        actionStatus,
        routingRuleHit: rule,
        aiDraftOrReply: transcript ?? "",
        citedChunkIds: JSON.stringify(citations),
      },
    });

    await prisma.ticketEvent.createMany({
      data: [
        {
          ticketId: ticket.id,
          eventType: "INBOUND_RECEIVED",
          payload: JSON.stringify({ channel: "VOICE", sessionId: session.id }),
        },
        {
          ticketId: ticket.id,
          eventType: "ROUTING_DECIDED",
          payload: JSON.stringify({
            rule,
            actionStatus,
            source: "voice_webhook",
            escalated: escalate,
            citedChunkIds: citations,
          }),
        },
        {
          ticketId: ticket.id,
          eventType: escalate ? "ESCALATED" : grounded ? "AUTO_SENT" : "DRAFT_SAVED",
          payload: JSON.stringify({ durationSeconds, interactionId }),
        },
      ],
    });

    return NextResponse.json({
      sessionId: session.id,
      sessionStatus: status,
      escalationOutcome,
      ticketId: ticket.id,
      ticketState: state,
      actionStatus,
      routingRuleHit: rule,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

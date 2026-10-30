import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db.ts";
import { getCurrentUser } from "../../../../server/auth/session.ts";
import { loadBusinessChunks } from "../../../../server/business/service.ts";
import { completionOutcome } from "../../../../server/voice/session-state.ts";
import {
  completionDecision,
  verifiedCitations,
  voiceMessageId,
} from "../../../../server/voice/completion.ts";
import { HttpError, errorResponse, readJson } from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed"]);

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * POST /api/voice/sarvam-webhook — call completion (PRD §6, Phase 4).
 *
 * Authenticated either by the voice platform's shared token or by the owner's
 * session (the dashboard simulator). A completed call is written back onto the
 * session and becomes a VOICE ticket in the same queue.
 *
 * Two guarantees, both proven by the Phase 4 gate:
 *   - a replay of the same call creates nothing new (the ticket's
 *     `externalMessageId` is `voice:<sessionId>`) and never overwrites the first
 *     transcript or duration;
 *   - a citation the caller sends is only kept when it belongs to this
 *     business's chunks, so a foreign id can never mark the ticket "answered".
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

    const externalMessageId = voiceMessageId(session.id);
    const alreadyReported = await prisma.ticket.findFirst({
      where: { businessId: session.businessId, externalMessageId },
    });
    if (alreadyReported) {
      return NextResponse.json({
        sessionId: session.id,
        sessionStatus: session.status,
        escalationOutcome: session.escalationOutcome,
        ticketId: alreadyReported.id,
        ticketState: alreadyReported.state,
        actionStatus: alreadyReported.actionStatus,
        routingRuleHit: alreadyReported.routingRuleHit,
        duplicate: true,
      });
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
    const interactionId = typeof body["interactionId"] === "string" ? body["interactionId"] : null;

    const chunks = await loadBusinessChunks(session.businessId);
    const citations = verifiedCitations(
      body["citedChunkIds"],
      new Set(chunks.map((chunk) => chunk.id)),
    );
    const grounded = citations.length > 0;
    const decision = completionDecision({ escalate, grounded });
    const escalationOutcome = completionOutcome({ escalate, status });

    try {
      const ticket = await prisma.$transaction(async (tx) => {
        await tx.voiceTestSession.update({
          where: { id: session.id },
          data: {
            status,
            transcript,
            durationSeconds,
            escalationOutcome,
            ...(interactionId !== null ? { sarvamInteractionId: interactionId } : {}),
          },
        });

        const row = await tx.ticket.create({
          data: {
            businessId: session.businessId,
            externalMessageId,
            channel: "VOICE",
            customerName: "Voice caller",
            customerHandle: session.judgePhone,
            customerQuery:
              transcript !== null && transcript.length > 0 ? transcript.slice(0, 500) : "Voice call",
            state: decision.state,
            specialistAssigned: "general",
            intent: escalate ? "voice_escalation" : grounded ? "voice_resolved" : "voice_unverified",
            sentiment: escalate ? "frustrated" : "neutral",
            urgencyScore: escalate ? 85 : 30,
            // Voice clears the same floor as text; nothing more is claimed than that.
            confidenceScore: grounded ? 50 : 0,
            actionStatus: decision.actionStatus,
            routingRuleHit: decision.rule,
            aiDraftOrReply: transcript ?? "",
            citedChunkIds: JSON.stringify(citations),
          },
        });

        await tx.ticketEvent.createMany({
          data: [
            {
              ticketId: row.id,
              eventType: "INBOUND_RECEIVED",
              payload: JSON.stringify({ channel: "VOICE", sessionId: session.id }),
            },
            {
              ticketId: row.id,
              eventType: "ROUTING_DECIDED",
              payload: JSON.stringify({
                rule: decision.rule,
                actionStatus: decision.actionStatus,
                source: "voice_webhook",
                escalated: escalate,
                citedChunkIds: citations,
              }),
            },
            {
              ticketId: row.id,
              eventType: escalate ? "ESCALATED" : grounded ? "AUTO_SENT" : "DRAFT_SAVED",
              payload: JSON.stringify({ durationSeconds, interactionId }),
            },
          ],
        });

        return row;
      });

      return NextResponse.json({
        sessionId: session.id,
        sessionStatus: status,
        escalationOutcome,
        ticketId: ticket.id,
        ticketState: decision.state,
        actionStatus: decision.actionStatus,
        routingRuleHit: decision.rule,
        duplicate: false,
      });
    } catch (error) {
      // Two simultaneous completions of one call: the unique id picks the winner and the
      // loser answers with the winner's ticket, having rolled its own write back.
      if (isUniqueViolation(error)) {
        const raced = await prisma.ticket.findFirst({
          where: { businessId: session.businessId, externalMessageId },
        });
        if (raced) {
          const stored = await prisma.voiceTestSession.findUnique({ where: { id: session.id } });
          return NextResponse.json({
            sessionId: session.id,
            sessionStatus: stored?.status ?? session.status,
            escalationOutcome: stored?.escalationOutcome ?? null,
            ticketId: raced.id,
            ticketState: raced.state,
            actionStatus: raced.actionStatus,
            routingRuleHit: raced.routingRuleHit,
            duplicate: true,
          });
        }
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

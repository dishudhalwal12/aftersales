import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db.ts";
import { loadBusinessChunks } from "../../../../server/business/service.ts";
import { searchMarkdownRag } from "../../../../server/ai/rag.ts";
import { UNGROUNDED_REPLY, groundVoiceAnswer } from "../../../../server/voice/grounding.ts";
import {
  authorizeVoiceContext,
  parseTrustedIdentifiers,
  resolveCallBusiness,
} from "../../../../server/voice/context.ts";
import { HttpError, errorResponse, readJson } from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/sarvam-tool-search — PRD §5.4.
 * Called by the voice agent mid-call. Resolves the active session, then answers
 * from that session's business only. The voice path uses the deterministic
 * retriever (no extra model round-trip) so the answer lands inside the turn.
 *
 * Public by necessity (the voice platform calls it); the session id / PIN / phone
 * is the capability that scopes it to one business.
 *
 * The confidence floor is the text path's (PRD §0): `groundVoiceAnswer` refuses to
 * answer below 50 or without a citation, so a caller cannot be read another
 * business's price list just because a chunk matched one word.
 */
export async function POST(request: Request) {
  try {
    const auth = authorizeVoiceContext(request.headers);
    if (auth.configured && !auth.authorized) {
      throw new HttpError(401, "missing or invalid voice context token");
    }

    const body = await readJson(request);

    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "";
    const demoPin = typeof body["demoPin"] === "string" ? body["demoPin"] : "";
    const callerPhone = typeof body["callerPhone"] === "string" ? body["callerPhone"] : "";
    const query = typeof body["query"] === "string" ? body["query"].trim() : "";
    const trusted = parseTrustedIdentifiers(body);
    const agentId = trusted.agentId ?? "";
    const virtualNumber = trusted.virtualNumber ?? "";

    if (query.length === 0) throw new HttpError(400, 'field "query" is required');
    if (
      sessionId.length === 0 &&
      demoPin.length === 0 &&
      callerPhone.length === 0 &&
      agentId.length === 0 &&
      virtualNumber.length === 0
    ) {
      throw new HttpError(
        400,
        "one of sessionId, demoPin, callerPhone, agentId or virtualNumber is required",
      );
    }

    let businessId: string;
    let businessName: string;
    let resolvedSessionId: string | null = null;

    if (agentId.length > 0 || virtualNumber.length > 0) {
      const resolution = await resolveCallBusiness({
        agentId: agentId.length > 0 ? agentId : null,
        virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
        sessionId: "",
        demoPin: "",
      });
      const business = await prisma.business.findUnique({
        where: { id: resolution.businessId },
        select: { id: true, name: true },
      });
      if (!business) throw new HttpError(404, "business not found");
      businessId = business.id;
      businessName = business.name;
      resolvedSessionId = resolution.session?.id ?? null;
    } else {
      const session = await prisma.voiceTestSession.findFirst({
        where: {
          ...(sessionId.length > 0 ? { id: sessionId } : {}),
          ...(demoPin.length > 0 ? { demoPin } : {}),
          ...(callerPhone.length > 0 ? { judgePhone: callerPhone } : {}),
          ...(sessionId.length === 0 && demoPin.length === 0 ? { status: { not: "completed" } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { business: true },
      });

      if (!session) throw new HttpError(404, "no voice session matches this caller");
      if (session.expiresAt.getTime() < Date.now()) {
        throw new HttpError(410, "this voice session has expired — start a new call");
      }

      if (session.status === "initiated" || session.status === "ringing") {
        await prisma.voiceTestSession.update({
          where: { id: session.id },
          data: { status: "in_progress" },
        });
      }

      businessId = session.businessId;
      businessName = session.business.name;
      resolvedSessionId = session.id;
    }

    const chunks = await loadBusinessChunks(businessId);
    const hits = searchMarkdownRag(chunks, query, 4);
    const grounding = groundVoiceAnswer(query, hits);

    return NextResponse.json({
      businessName,
      groundedFacts: grounding.escalateToHuman
        ? `${UNGROUNDED_REPLY} A human from ${businessName} can help.`
        : grounding.groundedFacts,
      citedChunkIds: grounding.citedChunkIds,
      confidenceScore: grounding.confidenceScore,
      escalateToHuman: grounding.escalateToHuman,
      sessionId: resolvedSessionId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

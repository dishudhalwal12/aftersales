import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.ts";
import { loadBusinessChunks } from "../../../../lib/business-service.ts";
import { bestSentences, retrievalConfidence, searchMarkdownRag } from "../../../../lib/rag.ts";
import { HttpError, errorResponse, readJson } from "../../../../lib/tenant.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/sarvam-tool-search — PRD §5.4.
 * Called by the voice agent mid-call. Resolves the active session, then answers
 * from that session's business only. The voice path uses the deterministic
 * retriever (no extra model round-trip) so the answer lands inside the turn.
 *
 * Public by necessity (the voice platform calls it); the session id / PIN / phone
 * is the capability that scopes it to one business.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "";
    const demoPin = typeof body["demoPin"] === "string" ? body["demoPin"] : "";
    const callerPhone = typeof body["callerPhone"] === "string" ? body["callerPhone"] : "";
    const query = typeof body["query"] === "string" ? body["query"].trim() : "";

    if (query.length === 0) throw new HttpError(400, 'field "query" is required');
    if (sessionId.length === 0 && demoPin.length === 0 && callerPhone.length === 0) {
      throw new HttpError(400, "one of sessionId, demoPin or callerPhone is required");
    }

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

    if (session.status === "initiated" || session.status === "ringing" || session.status === "test_mode") {
      await prisma.voiceTestSession.update({
        where: { id: session.id },
        data: { status: "in_progress" },
      });
    }

    const chunks = await loadBusinessChunks(session.businessId);
    const hits = searchMarkdownRag(chunks, query, 4);
    const top = hits[0];
    // Same coverage floor as the text path: a voice answer below 50 is a human's job.
    const confidenceScore = retrievalConfidence(query, hits);
    const escalateToHuman = top === undefined || confidenceScore < 50;
    const groundedFacts = top === undefined ? "" : bestSentences(query, top.content, 2);

    return NextResponse.json({
      businessName: session.business.name,
      groundedFacts: escalateToHuman
        ? `I do not have a grounded answer for that. A human from ${session.business.name} can help.`
        : groundedFacts,
      citedChunkIds: top && !escalateToHuman ? [top.id] : [],
      confidenceScore,
      escalateToHuman,
      sessionId: session.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

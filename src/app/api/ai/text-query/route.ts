import { NextResponse } from "next/server";
import { respondToContact } from "../../../../server/business/service.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../server/auth/tenant.ts";
import type { TicketChannel } from "../../../../shared/domain.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNELS: ReadonlySet<string> = new Set([
  "TEXT_MODAL",
  "WHATSAPP",
  "FACEBOOK",
  "INSTAGRAM",
  "GMAIL",
  "VOICE",
]);

/**
 * POST /api/ai/text-query — PRD §5.2.
 * `businessId` is always resolved against the session's ownership; it is never
 * trusted from the model or from a caller-supplied owner id.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);

    const businessId = requireString(body, "businessId", { max: 100 });
    const query = requireString(body, "query", { max: 4000 });
    const customerName = requireString(body, "customerName", { max: 120, optional: true });
    const customerHandle = requireString(body, "customerHandle", { max: 200, optional: true });
    const channelRaw = requireString(body, "channel", { max: 20, optional: true });
    const channel = (channelRaw.length > 0 ? channelRaw.toUpperCase() : "TEXT_MODAL") as string;

    if (!CHANNELS.has(channel)) {
      throw new HttpError(400, "field \"channel\" is not a supported channel");
    }

    const business = await loadOwnedBusiness(user.id, businessId);

    const result = await respondToContact({
      business,
      channel: channel as TicketChannel,
      customerName: customerName.length > 0 ? customerName : "Judge Tester",
      customerHandle: customerHandle.length > 0 ? customerHandle : "judge@sphinx.mnit.ac.in",
      query,
      externalMessageId: null,
    });

    return NextResponse.json({
      ticketId: result.ticketId,
      businessId: result.businessId,
      specialist: result.specialist,
      intent: result.intent,
      sentiment: result.sentiment,
      urgencyScore: result.urgencyScore,
      confidenceScore: result.confidenceScore,
      actionStatus: result.actionStatus,
      routingRuleHit: result.routingRuleHit,
      shouldAutoSend: result.shouldAutoSend,
      answer: result.answer,
      sources: result.sources,
      provider: result.provider,
      degraded: result.degraded,
      classifierError: result.classifierError,
      decisionSheet: result.decisionSheet,
      decisionSheetError: result.decisionSheetError,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

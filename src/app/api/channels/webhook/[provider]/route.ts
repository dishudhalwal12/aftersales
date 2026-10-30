import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db.ts";
import { respondToContact } from "../../../../../lib/business-service.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../lib/tenant.ts";
import type { TicketChannel } from "../../../../../lib/types.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

const PROVIDER_CHANNEL: Readonly<Record<string, TicketChannel>> = {
  whatsapp: "WHATSAPP",
  instagram: "INSTAGRAM",
  gmail: "GMAIL",
};

/**
 * POST /api/channels/webhook/[provider]
 * The inbound edge for the simulator and for a real adapter. Idempotency is the
 * unique index on `Ticket.externalMessageId`: the same payload twice is one
 * ticket and one decision (AT-10).
 */
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { provider } = await context.params;
    const channel = PROVIDER_CHANNEL[provider.toLowerCase()];
    if (!channel) throw new HttpError(404, `unknown channel provider: ${provider}`);

    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    const externalMessageId = requireString(body, "externalMessageId", { max: 200 });
    const query = requireString(body, "query", { max: 4000 });
    const customerName = requireString(body, "customerName", { max: 120, optional: true });
    const customerHandle = requireString(body, "customerHandle", { max: 200, optional: true });

    const business = await loadOwnedBusiness(user.id, businessId);

    const result = await respondToContact({
      business,
      channel,
      customerName: customerName.length > 0 ? customerName : `${channel} customer`,
      customerHandle: customerHandle.length > 0 ? customerHandle : `unknown-${channel.toLowerCase()}`,
      query,
      externalMessageId,
    });

    return NextResponse.json({
      provider: provider.toLowerCase(),
      duplicate: result.duplicate,
      ticketId: result.ticketId,
      businessId: result.businessId,
      routingRuleHit: result.routingRuleHit,
      actionStatus: result.actionStatus,
      shouldAutoSend: result.shouldAutoSend,
      confidenceScore: result.confidenceScore,
      specialist: result.specialist,
      answer: result.answer,
      sources: result.sources,
      provider_used: result.provider,
      degraded: result.degraded,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/channels/webhook/[provider] — truthful readiness for the panel. */
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { provider } = await context.params;
    const channel = PROVIDER_CHANNEL[provider.toLowerCase()];
    if (!channel) throw new HttpError(404, `unknown channel provider: ${provider}`);

    const businessId = new URL(request.url).searchParams.get("businessId") ?? "";
    const business = await loadOwnedBusiness(user.id, businessId);

    const connection = await prisma.channelConnection.findUnique({
      where: { businessId_channelType: { businessId: business.id, channelType: channel } },
    });

    return NextResponse.json({
      provider: provider.toLowerCase(),
      channel,
      configured: connection !== null,
      status: connection?.status ?? "UNAVAILABLE",
      autoSend: connection?.autoSend ?? false,
      transport: transportFor(provider.toLowerCase()),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function transportFor(provider: string): string {
  if (provider === "whatsapp") return "simulated inbox (no live Baileys session in this deployment)";
  if (provider === "instagram") return "simulated inbox (Meta app review not completed)";
  if (provider === "gmail") return "simulated inbox (OAuth not configured)";
  return "unknown";
}

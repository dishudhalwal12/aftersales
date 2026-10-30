import { NextResponse } from "next/server";
import { prisma } from "../../../../../server/db.ts";
import { respondToContact } from "../../../../../server/business/service.ts";
import { channelForProvider, isWebhookTokenValid } from "../../../../../server/business/channel-webhook.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

/**
 * POST /api/channels/webhook/[provider]
 * The inbound edge for the simulator and for a real adapter. Two ways in:
 *   - the owner's session (the dashboard simulator),
 *   - `x-channel-token` matching CHANNEL_WEBHOOK_SECRET (a provider delivery).
 * Idempotency is the unique index on (businessId, externalMessageId): the same payload twice is
 * one ticket and one decision (AT-10), and a replay carrying another tenant's id is that
 * tenant's own delivery (AT-05).
 */
export async function POST(request: Request, context: Context) {
  try {
    const { provider } = await context.params;
    const channel = channelForProvider(provider);
    if (!channel) throw new HttpError(404, `unknown channel provider: ${provider}`);

    const platformAuthorised = isWebhookTokenValid(
      process.env.CHANNEL_WEBHOOK_SECRET ?? "",
      request.headers.get("x-channel-token") ?? "",
    );
    const user = platformAuthorised ? null : await requireUser();

    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    const externalMessageId = requireString(body, "externalMessageId", { max: 200 });
    const query = requireString(body, "query", { max: 4000 });
    const customerName = requireString(body, "customerName", { max: 120, optional: true });
    const customerHandle = requireString(body, "customerHandle", { max: 200, optional: true });

    const business =
      user !== null
        ? await loadOwnedBusiness(user.id, businessId)
        : await loadBusinessForProvider(businessId);

    const result = await respondToContact({
      business,
      channel,
      customerName: customerName.length > 0 ? customerName : `${channel} customer`,
      customerHandle: customerHandle.length > 0 ? customerHandle : `unknown-${channel.toLowerCase()}`,
      query,
      externalMessageId,
    });

    return NextResponse.json({
      provider: provider.trim().toLowerCase(),
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
    const channel = channelForProvider(provider);
    if (!channel) throw new HttpError(404, `unknown channel provider: ${provider}`);

    const businessId = new URL(request.url).searchParams.get("businessId") ?? "";
    const business = await loadOwnedBusiness(user.id, businessId);

    const connection = await prisma.channelConnection.findUnique({
      where: { businessId_channelType: { businessId: business.id, channelType: channel } },
    });

    return NextResponse.json({
      provider: provider.trim().toLowerCase(),
      channel,
      configured: connection !== null,
      status: connection?.status ?? "UNAVAILABLE",
      autoSend: connection?.autoSend ?? false,
      transport: transportFor(provider.trim().toLowerCase()),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A provider delivery carries its business id, but the platform token is not a tenant session:
 * an unknown id is a 404, never a write under a guessed row.
 */
async function loadBusinessForProvider(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new HttpError(404, "business not found");
  return business;
}

function transportFor(provider: string): string {
  if (provider === "whatsapp") return "simulated inbox (no live Baileys session in this deployment)";
  if (provider === "instagram") return "simulated inbox (Meta app review not completed)";
  if (provider === "gmail") return "simulated inbox (OAuth not configured)";
  return "unknown";
}

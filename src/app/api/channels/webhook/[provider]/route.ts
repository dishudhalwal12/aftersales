import type { Business } from "@prisma/client";
import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, getSessionUser } from "@/lib/auth";
import {
  handleInboundWebhook,
  parseWebhookProvider,
  webhookSecretMatches,
} from "@/lib/channel-webhook";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const webhookSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  externalMessageId: z.string().trim().min(1, "externalMessageId is required.").max(200),
  customerName: z.string().trim().min(1).max(120),
  customerHandle: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1, "message is required.").max(2000),
  webhookSecret: z.string().trim().min(1).max(500).optional(),
});

// Two callers share this endpoint:
// - the dashboard simulator, authenticated by the owner's session, and
// - an external provider, authenticated by the secret bound to that channel row.
// `businessId` is only honoured after one of those checks passes.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider: rawProvider } = await params;
    const provider = parseWebhookProvider(rawProvider);
    if (!provider) {
      throw new ApiError(
        404,
        "UNKNOWN_PROVIDER",
        "Supported webhook providers: whatsapp, facebook, instagram, gmail."
      );
    }

    const body = webhookSchema.parse(await parseJsonBody(request));
    const session = await getSessionUser();

    let business: Business;
    if (session) {
      business = await assertBusinessOwnership(session.id, body.businessId);
    } else {
      const connection = await prisma.channelConnection.findUnique({
        where: {
          businessId_channelType: {
            businessId: body.businessId,
            channelType: provider,
          },
        },
      });
      const providedSecret =
        request.headers.get("x-webhook-secret") ?? body.webhookSecret ?? null;

      if (!connection || !webhookSecretMatches(connection.configJson, providedSecret)) {
        throw new ApiError(401, "UNAUTHORIZED", "Webhook authentication failed.");
      }

      if (connection.status === "UNAVAILABLE") {
        throw new ApiError(
          409,
          "CHANNEL_UNAVAILABLE",
          `The ${provider} channel is not available for this business.`
        );
      }

      const found = await prisma.business.findUnique({
        where: { id: body.businessId },
      });
      if (!found) {
        throw new ApiError(401, "UNAUTHORIZED", "Webhook authentication failed.");
      }
      business = found;
    }

    const outcome = await handleInboundWebhook({
      business,
      provider,
      externalMessageId: body.externalMessageId,
      customerName: body.customerName,
      customerHandle: body.customerHandle,
      message: body.message,
    });

    return jsonOk(
      { duplicate: outcome.duplicate, ...outcome.result },
      outcome.duplicate ? 200 : 201
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

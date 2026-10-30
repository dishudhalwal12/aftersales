import { z } from "zod";

import { ApiError, jsonOk, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getBaileysConnection, isBaileysConnectionMissing } from "@/lib/baileys";
import { resolveOwnedWhatsappChannel } from "@/lib/whatsapp-access";
import {
  connectionResponse,
  readWhatsappConnectionId,
  saveWhatsappSnapshot,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
});

// Polled by the dashboard while the QR is on screen and afterwards to learn
// when the phone completed Linked Devices.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const { businessId } = querySchema.parse({
      businessId: searchParams.get("businessId") ?? undefined,
    });

    const { channel } = await resolveOwnedWhatsappChannel(user.id, businessId);
    const connectionId = readWhatsappConnectionId(channel.configJson);
    if (!connectionId) {
      throw new ApiError(
        404,
        "WHATSAPP_NOT_CONNECTED",
        "Connect WhatsApp before requesting a QR code."
      );
    }

    let snapshot;
    try {
      snapshot = await getBaileysConnection(connectionId);
    } catch (error) {
      if (isBaileysConnectionMissing(error)) {
        throw new ApiError(
          409,
          "WHATSAPP_RECONNECT_REQUIRED",
          "The local WhatsApp service is not tracking this connection. Connect WhatsApp again."
        );
      }
      throw error;
    }

    const updated = await saveWhatsappSnapshot(channel, snapshot);
    return jsonOk(connectionResponse(updated, snapshot));
  } catch (error) {
    return toErrorResponse(error);
  }
}

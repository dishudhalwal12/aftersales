import { NextResponse } from "next/server";
import {
  errorResponse,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import {
  getBaileysConnection,
  isBaileysConnectionMissing,
} from "../../../../../server/integrations/baileys.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { resolveOwnedWhatsappChannel } from "../../../../../server/integrations/whatsapp-access.ts";
import {
  connectionResponse,
  readWhatsappConnectionId,
  saveWhatsappSnapshot,
} from "../../../../../server/integrations/whatsapp.ts";

export const dynamic = "force-dynamic";

// Polled by the dashboard while the QR is on screen and afterwards to learn
// when the phone completed Linked Devices.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "businessId is required.");
    }

    const { channel } = await resolveOwnedWhatsappChannel(user.id, businessId);
    const connectionId = readWhatsappConnectionId(channel.configJson);
    if (!connectionId) {
      throw new IntegrationError(
        404,
        "WHATSAPP_NOT_CONNECTED",
        "Connect WhatsApp before requesting a QR code.",
      );
    }

    let snapshot;
    try {
      snapshot = await getBaileysConnection(connectionId);
    } catch (error) {
      if (isBaileysConnectionMissing(error)) {
        throw new IntegrationError(
          409,
          "WHATSAPP_RECONNECT_REQUIRED",
          "The local WhatsApp service is not tracking this connection. Connect WhatsApp again.",
        );
      }
      throw error;
    }

    const updated = await saveWhatsappSnapshot(channel, snapshot);
    return NextResponse.json(connectionResponse(updated, snapshot));
  } catch (error) {
    return errorResponse(error);
  }
}

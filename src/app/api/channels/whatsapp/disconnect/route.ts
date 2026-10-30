import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  type BaileysConnectionSnapshot,
  disconnectBaileysConnection,
  isBaileysConnectionMissing,
} from "@/lib/baileys";
import { resolveOwnedWhatsappChannel } from "@/lib/whatsapp-access";
import {
  connectionResponse,
  readWhatsappConnectionId,
  saveWhatsappSnapshot,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const disconnectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  logout: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = disconnectSchema.parse(await parseJsonBody(request));
    const { business, channel } = await resolveOwnedWhatsappChannel(
      user.id,
      body.businessId
    );

    const connectionId = readWhatsappConnectionId(channel.configJson);
    if (!connectionId) {
      throw new ApiError(
        404,
        "WHATSAPP_NOT_CONNECTED",
        "This business has no WhatsApp connection to disconnect."
      );
    }

    let snapshot: BaileysConnectionSnapshot;
    try {
      snapshot = await disconnectBaileysConnection(connectionId, business.id, {
        logout: body.logout,
      });
    } catch (error) {
      // The service may have restarted and lost its in-memory record; the
      // sessions on disk are still ours to close out locally.
      if (!isBaileysConnectionMissing(error)) throw error;
      snapshot = {
        connectionId,
        status: body.logout ? "logged_out" : "disconnected",
        qr: null,
        qrExpiresAt: null,
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
      };
    }

    const updated = await saveWhatsappSnapshot(channel, snapshot);
    return jsonOk(connectionResponse(updated, snapshot));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { startBaileysConnection } from "@/lib/baileys";
import { resolveOwnedWhatsappChannel } from "@/lib/whatsapp-access";
import {
  connectionResponse,
  createWhatsappConnectionId,
  readWhatsappConnectionId,
  saveWhatsappSnapshot,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
});

// Owner-initiated: verifies ownership, reuses the business's existing
// connectionId (or mints one), asks the local service for a socket, and
// returns the QR snapshot. WhatsApp credentials never leave the service.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = connectSchema.parse(await parseJsonBody(request));
    const owned = await resolveOwnedWhatsappChannel(user.id, body.businessId);
    const { business } = owned;
    let channel = owned.channel;

    const existing = readWhatsappConnectionId(channel.configJson);
    const connectionId = existing ?? createWhatsappConnectionId();

    // Persist the id before the call so a retry after a timeout reuses the
    // same connection instead of orphaning a socket in the service.
    if (!existing) {
      channel = await saveWhatsappSnapshot(channel, { connectionId, status: "connecting" });
    }

    const snapshot = await startBaileysConnection(connectionId, business.id);
    const updated = await saveWhatsappSnapshot(channel, snapshot);

    return jsonOk(connectionResponse(updated, snapshot));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import {
  errorResponse,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { startBaileysConnection } from "../../../../../server/integrations/baileys.ts";
import { resolveOwnedWhatsappChannel } from "../../../../../server/integrations/whatsapp-access.ts";
import {
  connectionResponse,
  createWhatsappConnectionId,
  readWhatsappConnectionId,
  saveWhatsappSnapshot,
} from "../../../../../server/integrations/whatsapp.ts";

export const dynamic = "force-dynamic";

// Owner-initiated: verifies ownership, reuses the business's existing
// connectionId (or mints one), asks the local service for a socket, and
// returns the QR snapshot. WhatsApp credentials never leave the service.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    const owned = await resolveOwnedWhatsappChannel(user.id, businessId);
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

    return NextResponse.json(connectionResponse(updated, snapshot));
  } catch (error) {
    return errorResponse(error);
  }
}

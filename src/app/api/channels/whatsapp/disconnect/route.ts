import { NextResponse } from "next/server";
import {
  errorResponse,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import {
  type BaileysConnectionSnapshot,
  disconnectBaileysConnection,
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    const logout = body.logout === undefined ? true : body.logout === true;
    const { business, channel } = await resolveOwnedWhatsappChannel(user.id, businessId);

    const connectionId = readWhatsappConnectionId(channel.configJson);
    if (!connectionId) {
      throw new IntegrationError(
        404,
        "WHATSAPP_NOT_CONNECTED",
        "This business has no WhatsApp connection to disconnect.",
      );
    }

    let snapshot: BaileysConnectionSnapshot;
    try {
      snapshot = await disconnectBaileysConnection(connectionId, business.id, { logout });
    } catch (error) {
      // The service may have restarted and lost its in-memory record; the
      // sessions on disk are still ours to close out locally.
      if (!isBaileysConnectionMissing(error)) throw error;
      snapshot = {
        connectionId,
        status: logout ? "logged_out" : "disconnected",
        qr: null,
        qrExpiresAt: null,
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
      };
    }

    const updated = await saveWhatsappSnapshot(channel, snapshot);
    return NextResponse.json(connectionResponse(updated, snapshot));
  } catch (error) {
    return errorResponse(error);
  }
}

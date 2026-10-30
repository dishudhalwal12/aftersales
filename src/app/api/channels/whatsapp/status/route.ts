import { NextResponse } from "next/server";
import {
  errorResponse,
  readJson,
  requireString,
} from "../../../../../server/auth/tenant.ts";
import {
  BAILEYS_SECRET_HEADER,
  assertBaileysSecret,
  isBaileysStatus,
} from "../../../../../server/integrations/baileys.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { applyBaileysStatus } from "../../../../../server/integrations/whatsapp.ts";

export const dynamic = "force-dynamic";

// Connection lifecycle events from the local service. An unknown connectionId
// is rejected so a stray service cannot flip another tenant's channel.
export async function POST(request: Request) {
  try {
    assertBaileysSecret(request.headers.get(BAILEYS_SECRET_HEADER));

    const body = await readJson(request);
    const connectionId = requireString(body, "connectionId", { max: 80 });
    if (!isBaileysStatus(body.status)) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "status is not a known WhatsApp status");
    }
    const status = body.status;
    const businessId =
      typeof body.businessId === "string" && body.businessId.trim()
        ? body.businessId.trim().slice(0, 80)
        : undefined;
    const phoneNumber =
      typeof body.phoneNumber === "string" ? body.phoneNumber.trim().slice(0, 40) : null;
    const lastError = typeof body.lastError === "string" ? body.lastError.slice(0, 500) : null;

    const channel = await applyBaileysStatus({
      connectionId,
      businessId: businessId ?? null,
      status,
      phoneNumber,
      lastError,
    });

    return NextResponse.json({
      connectionId,
      businessId: channel.businessId,
      whatsappStatus: status,
      channelStatus: channel.status,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import {
  BAILEYS_SECRET_HEADER,
  BAILEYS_STATUSES,
  assertBaileysSecret,
} from "@/lib/baileys";
import { applyBaileysStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Connection lifecycle events from the local service. An unknown connectionId
// is rejected so a stray service cannot flip another tenant's channel.
const statusSchema = z.object({
  connectionId: z.string().trim().min(8).max(80),
  businessId: z.string().trim().max(80).optional(),
  status: z.enum(BAILEYS_STATUSES),
  phoneNumber: z.string().trim().max(40).nullable().optional(),
  lastError: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    assertBaileysSecret(request.headers.get(BAILEYS_SECRET_HEADER));

    const body = statusSchema.parse(await parseJsonBody(request));
    const channel = await applyBaileysStatus({
      connectionId: body.connectionId,
      businessId: body.businessId,
      status: body.status,
      phoneNumber: body.phoneNumber ?? null,
      lastError: body.lastError ?? null,
    });

    return jsonOk({
      connectionId: body.connectionId,
      businessId: channel.businessId,
      whatsappStatus: body.status,
      channelStatus: channel.status,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

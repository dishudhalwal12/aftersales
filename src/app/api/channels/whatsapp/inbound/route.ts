import { z } from "zod";

import { BAILEYS_SECRET_HEADER, assertBaileysSecret } from "@/lib/baileys";
import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { processWhatsappInbound } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Sent by the local Baileys service for every text message. Authentication is
// the shared service secret; the tenant is resolved from connectionId, never
// from anything the message claims about itself.
const inboundSchema = z.object({
  connectionId: z.string().trim().min(8).max(80),
  messageId: z.string().trim().min(1).max(200),
  sender: z.string().trim().min(1).max(200),
  recipient: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
  messageType: z.literal("text").optional(),
  timestamp: z.number().optional(),
  direction: z.literal("inbound").optional(),
});

export async function POST(request: Request) {
  try {
    assertBaileysSecret(request.headers.get(BAILEYS_SECRET_HEADER));

    const body = inboundSchema.parse(await parseJsonBody(request));
    const outcome = await processWhatsappInbound({
      connectionId: body.connectionId,
      messageId: body.messageId,
      sender: body.sender,
      text: body.text,
    });

    return jsonOk(outcome);
  } catch (error) {
    return toErrorResponse(error);
  }
}

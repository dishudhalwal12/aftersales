import { NextResponse } from "next/server";
import {
  errorResponse,
  readJson,
  requireString,
} from "../../../../../server/auth/tenant.ts";
import {
  BAILEYS_SECRET_HEADER,
  assertBaileysSecret,
} from "../../../../../server/integrations/baileys.ts";
import { processWhatsappInbound } from "../../../../../server/integrations/whatsapp.ts";

export const dynamic = "force-dynamic";

// Sent by the local Baileys service for every text message. Authentication is
// the shared service secret; the tenant is resolved from connectionId, never
// from anything the message claims about itself.
export async function POST(request: Request) {
  try {
    assertBaileysSecret(request.headers.get(BAILEYS_SECRET_HEADER));

    const body = await readJson(request);
    const connectionId = requireString(body, "connectionId", { max: 80 });
    const messageId = requireString(body, "messageId", { max: 200 });
    const sender = requireString(body, "sender", { max: 200 });
    const text = requireString(body, "text", { max: 2000 });

    const outcome = await processWhatsappInbound({ connectionId, messageId, sender, text });
    return NextResponse.json(outcome);
  } catch (error) {
    return errorResponse(error);
  }
}

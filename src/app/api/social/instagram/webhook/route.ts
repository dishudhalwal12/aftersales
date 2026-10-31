import { NextResponse } from "next/server";
import { errorResponse } from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import {
  processInstagramWebhook,
  readInstagramSettings,
  verifyInstagramChallenge,
  verifyInstagramSignature,
  type InstagramWebhookPayload,
} from "../../../../../server/integrations/instagram.ts";

export const dynamic = "force-dynamic";

// GET is Instagram's webhook verification handshake.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const settings = readInstagramSettings();
    const challenge = verifyInstagramChallenge({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
      expectedToken: settings.verifyToken,
    });

    if (!challenge) {
      throw new IntegrationError(403, "INSTAGRAM_VERIFY_FAILED", "Webhook verification failed.");
    }

    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST receives DM ("messaging") and comment ("changes") events. The signature
// is verified against INSTAGRAM_APP_SECRET before anything is processed.
export async function POST(request: Request) {
  try {
    const settings = readInstagramSettings();
    if (!settings.appSecret) {
      throw new IntegrationError(
        503,
        "INSTAGRAM_NOT_CONFIGURED",
        "INSTAGRAM_APP_SECRET is not set.",
      );
    }

    const rawBody = await request.text();
    if (
      !verifyInstagramSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        settings.appSecret,
      )
    ) {
      throw new IntegrationError(
        401,
        "INSTAGRAM_SIGNATURE_INVALID",
        "Webhook signature verification failed.",
      );
    }

    let payload: InstagramWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as InstagramWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: { code: 400, message: "Webhook body must be valid JSON." } },
        { status: 400 },
      );
    }

    // Meta expects a fast 2xx; per-event failures are logged inside the handler.
    const summary = await processInstagramWebhook(payload);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}

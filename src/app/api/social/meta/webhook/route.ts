import { NextResponse } from "next/server";
import { errorResponse } from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import {
  processMetaWebhook,
  readMetaSettings,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
  type MetaWebhookPayload,
} from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

// GET is Meta's webhook verification handshake.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const settings = readMetaSettings();
    const challenge = verifyMetaWebhookChallenge({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
      expectedToken: settings.verifyToken,
    });

    if (!challenge) {
      throw new IntegrationError(403, "META_VERIFY_FAILED", "Webhook verification failed.");
    }

    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST receives Messenger (object "page") and Instagram (object "instagram")
// events. The raw body is required for the X-Hub-Signature-256 check.
export async function POST(request: Request) {
  try {
    const settings = readMetaSettings();
    if (!settings.appSecret) {
      throw new IntegrationError(503, "META_NOT_CONFIGURED", "META_APP_SECRET is not set.");
    }

    const rawBody = await request.text();
    if (
      !verifyMetaSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        settings.appSecret,
      )
    ) {
      throw new IntegrationError(
        401,
        "META_SIGNATURE_INVALID",
        "Webhook signature verification failed.",
      );
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MetaWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: { code: 400, message: "Webhook body must be valid JSON." } },
        { status: 400 },
      );
    }

    // Meta expects a fast 2xx; per-message failures are logged inside the
    // handler and do not turn into a retry storm.
    const summary = await processMetaWebhook(payload);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}

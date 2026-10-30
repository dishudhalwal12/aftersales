import { ApiError, jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import {
  processMetaWebhook,
  readMetaSettings,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
  type MetaWebhookPayload,
} from "@/lib/meta";

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
      throw new ApiError(403, "META_VERIFY_FAILED", "Webhook verification failed.");
    }

    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// POST receives Messenger (object "page") and Instagram (object "instagram")
// events. The raw body is required for the X-Hub-Signature-256 check.
export async function POST(request: Request) {
  try {
    const settings = readMetaSettings();
    if (!settings.appSecret) {
      throw new ApiError(503, "META_NOT_CONFIGURED", "META_APP_SECRET is not set.");
    }

    const rawBody = await request.text();
    if (
      !verifyMetaSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        settings.appSecret
      )
    ) {
      throw new ApiError(401, "META_SIGNATURE_INVALID", "Webhook signature verification failed.");
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MetaWebhookPayload;
    } catch {
      return jsonError(400, "INVALID_JSON", "Webhook body must be valid JSON.");
    }

    // Meta expects a fast 2xx; per-message failures are logged inside the
    // handler and do not turn into a retry storm.
    const summary = await processMetaWebhook(payload);
    return jsonOk({ ok: true, ...summary });
  } catch (error) {
    return toErrorResponse(error);
  }
}

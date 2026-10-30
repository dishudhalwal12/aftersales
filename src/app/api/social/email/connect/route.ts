import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { ensureChannelConnection } from "@/lib/channels";
import {
  buildGmailAuthorizationUrl,
  isEmailProviderSupported,
  readEmailProviderSettings,
} from "@/lib/email";
import {
  OAUTH_STATE_TTL_SECONDS,
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
  signOAuthState,
} from "@/lib/integration-crypto";
import { resolveIntegrationBaseUrl } from "@/lib/integrations";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
});

// Starts the Gmail OAuth flow. No credential is ever posted by the frontend;
// the owner approves access on Google and the backend receives the code.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = connectSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const settings = readEmailProviderSettings();
    if (!isEmailProviderSupported(settings.provider)) {
      throw new ApiError(
        400,
        "EMAIL_PROVIDER_NOT_SUPPORTED",
        `EMAIL_PROVIDER is "${settings.provider}", but this deployment only implements Gmail OAuth.`
      );
    }
    if (!settings.configured) {
      throw new ApiError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Gmail OAuth is not configured. Set EMAIL_GMAIL_CLIENT_ID and EMAIL_GMAIL_CLIENT_SECRET."
      );
    }
    if (!isIntegrationEncryptionConfigured() || !isOAuthStateSigningConfigured()) {
      throw new ApiError(
        503,
        "INTEGRATIONS_NOT_CONFIGURED",
        "Set INTEGRATION_ENCRYPTION_KEY and INTEGRATION_STATE_SECRET before connecting channels."
      );
    }

    await ensureChannelConnection(body.businessId, "GMAIL");

    let baseUrl: string;
    try {
      baseUrl = resolveIntegrationBaseUrl(request.url);
    } catch {
      throw new ApiError(
        503,
        "INTEGRATIONS_BASE_URL_MISSING",
        "Set INTEGRATIONS_BASE_URL to the public backend URL (for example https://your-app.vercel.app)."
      );
    }

    const redirectUri = `${baseUrl}/api/social/email/callback`;
    const state = signOAuthState({
      provider: "gmail",
      businessId: body.businessId,
      userId: user.id,
      redirectUri,
    });

    return jsonOk({
      provider: "gmail",
      method: "oauth",
      authorizationUrl: buildGmailAuthorizationUrl({ redirectUri, state }),
      redirectUri,
      expiresInSeconds: OAUTH_STATE_TTL_SECONDS,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

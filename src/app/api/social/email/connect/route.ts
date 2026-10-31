import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { resolveIntegrationBaseUrl } from "../../../../../server/integrations/base-url.ts";
import {
  clearIntegrationError,
  ensureChannelConnection,
} from "../../../../../server/integrations/channels.ts";
import {
  OAUTH_STATE_TTL_SECONDS,
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
  signOAuthState,
} from "../../../../../server/integrations/crypto.ts";
import {
  EMAIL_ERROR_KEY,
  buildGmailAuthorizationUrl,
  isEmailProviderSupported,
  readEmailProviderSettings,
} from "../../../../../server/integrations/email.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";

export const dynamic = "force-dynamic";

// Starts the Gmail OAuth flow. No credential is ever posted by the frontend;
// the owner approves access on Google and the backend receives the code.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const settings = readEmailProviderSettings();
    if (!isEmailProviderSupported(settings.provider)) {
      throw new IntegrationError(
        400,
        "EMAIL_PROVIDER_NOT_SUPPORTED",
        `EMAIL_PROVIDER is "${settings.provider}", but this deployment only implements Gmail OAuth.`,
      );
    }
    if (!settings.configured) {
      throw new IntegrationError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Gmail OAuth is not configured. Set EMAIL_GMAIL_CLIENT_ID and EMAIL_GMAIL_CLIENT_SECRET.",
      );
    }
    if (!isIntegrationEncryptionConfigured() || !isOAuthStateSigningConfigured()) {
      throw new IntegrationError(
        503,
        "INTEGRATIONS_NOT_CONFIGURED",
        "Set INTEGRATION_ENCRYPTION_KEY and INTEGRATION_STATE_SECRET before connecting channels.",
      );
    }

    // A fresh attempt supersedes the previous failure, so the status poll
    // cannot pick up a stale error while this flow is in progress.
    const channel = await ensureChannelConnection(businessId, "GMAIL");
    await clearIntegrationError(channel, EMAIL_ERROR_KEY);

    let baseUrl: string;
    try {
      baseUrl = resolveIntegrationBaseUrl(request.url);
    } catch {
      throw new IntegrationError(
        503,
        "INTEGRATIONS_BASE_URL_MISSING",
        "Set INTEGRATIONS_BASE_URL to the public backend URL (for example https://your-app.vercel.app).",
      );
    }

    const redirectUri = `${baseUrl}/api/social/email/callback`;
    const state = signOAuthState({
      provider: "gmail",
      businessId,
      userId: user.id,
      redirectUri,
    });

    return NextResponse.json({
      provider: "gmail",
      method: "oauth",
      authorizationUrl: buildGmailAuthorizationUrl({ redirectUri, state }),
      redirectUri,
      expiresInSeconds: OAUTH_STATE_TTL_SECONDS,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

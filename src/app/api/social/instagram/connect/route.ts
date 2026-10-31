import { NextResponse } from "next/server";
import { errorResponse, loadOwnedBusiness, requireUser } from "../../../../../server/auth/tenant.ts";
import { resolveIntegrationBaseUrl } from "../../../../../server/integrations/base-url.ts";
import {
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
  signOAuthState,
} from "../../../../../server/integrations/crypto.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import {
  buildInstagramAuthorizationUrl,
  readInstagramSettings,
} from "../../../../../server/integrations/instagram.ts";

export const dynamic = "force-dynamic";

// Redirects the browser to Instagram's Business Login dialog. This is the newer
// "Instagram API with Instagram Login" flow, not Facebook Login.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await loadOwnedBusiness(user.id, businessId);

    const settings = readInstagramSettings();
    if (!settings.configured) {
      throw new IntegrationError(
        503,
        "INSTAGRAM_NOT_CONFIGURED",
        "Instagram Login is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.",
      );
    }
    if (!isIntegrationEncryptionConfigured() || !isOAuthStateSigningConfigured()) {
      throw new IntegrationError(
        503,
        "INTEGRATIONS_NOT_CONFIGURED",
        "Set INTEGRATION_ENCRYPTION_KEY and INTEGRATION_STATE_SECRET before connecting channels.",
      );
    }

    let redirectUri = settings.redirectUri;
    if (!redirectUri) {
      let baseUrl: string;
      try {
        baseUrl = resolveIntegrationBaseUrl(request.url);
      } catch {
        throw new IntegrationError(
          503,
          "INTEGRATIONS_BASE_URL_MISSING",
          "Set INSTAGRAM_REDIRECT_URI or INTEGRATIONS_BASE_URL to the public backend URL.",
        );
      }
      redirectUri = `${baseUrl}/api/social/instagram/callback`;
    }

    const state = signOAuthState({
      provider: "instagram",
      businessId,
      userId: user.id,
      redirectUri,
    });

    return NextResponse.redirect(buildInstagramAuthorizationUrl({ redirectUri, state }));
  } catch (error) {
    return errorResponse(error);
  }
}

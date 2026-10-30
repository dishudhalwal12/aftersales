import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { ensureChannelConnection } from "@/lib/channels";
import { isIntegrationEncryptionConfigured, isOAuthStateSigningConfigured, signOAuthState } from "@/lib/integration-crypto";
import { resolveIntegrationBaseUrl } from "@/lib/integrations";
import { buildMetaAuthorizationUrl, readMetaSettings } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Redirects the browser to Meta's OAuth dialog. The frontend only needs to
// navigate here; no Meta credentials pass through the browser.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new ApiError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await assertBusinessOwnership(user.id, businessId);

    const settings = readMetaSettings();
    if (!settings.configured) {
      throw new ApiError(
        503,
        "META_NOT_CONFIGURED",
        "Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET."
      );
    }
    if (!isIntegrationEncryptionConfigured() || !isOAuthStateSigningConfigured()) {
      throw new ApiError(
        503,
        "INTEGRATIONS_NOT_CONFIGURED",
        "Set INTEGRATION_ENCRYPTION_KEY and INTEGRATION_STATE_SECRET before connecting channels."
      );
    }

    await ensureChannelConnection(businessId, "FACEBOOK");

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

    const redirectUri = `${baseUrl}/api/social/meta/callback`;
    const state = signOAuthState({
      provider: "meta",
      businessId,
      userId: user.id,
      redirectUri,
    });

    return NextResponse.redirect(buildMetaAuthorizationUrl({ redirectUri, state }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

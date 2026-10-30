import { ApiError, toErrorResponse } from "@/lib/api";
import { recordIntegrationError } from "@/lib/channels";
import { verifyOAuthState } from "@/lib/integration-crypto";
import { META_ERROR_KEY, completeMetaAuthorization } from "@/lib/meta";
import { oauthCallbackResponse } from "@/lib/oauth-redirect";

export const dynamic = "force-dynamic";

// Meta redirects here after consent. The owner still has to pick a Page or
// Instagram account, so this callback stores a short-lived encrypted selection
// and never marks a channel connected on its own.
export async function GET(request: Request) {
  const url = new URL(request.url);
  let businessId: string | null = null;

  try {
    const state = verifyOAuthState(url.searchParams.get("state"));
    businessId = state.businessId;

    if (state.provider !== "meta") {
      throw new ApiError(400, "OAUTH_PROVIDER_MISMATCH", "This state belongs to a different provider.");
    }

    if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
      throw new ApiError(
        400,
        "META_OAUTH_DENIED",
        "Meta access was cancelled or denied. Start the connection again to retry."
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new ApiError(400, "META_OAUTH_CODE_MISSING", "Meta did not return an authorization code.");
    }

    const { assets, expiresAt } = await completeMetaAuthorization({
      businessId: state.businessId,
      userId: state.userId,
      code,
      redirectUri: state.redirectUri,
    });

    return oauthCallbackResponse({
      integration: "meta",
      status: "pending_selection",
      businessId: state.businessId,
      details: { assets, pendingExpiresAt: expiresAt },
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(500, "META_OAUTH_FAILED", "The Meta connection could not be completed.");

    if (businessId) {
      await recordIntegrationError(businessId, "FACEBOOK", META_ERROR_KEY, apiError.message);
      return oauthCallbackResponse({
        integration: "meta",
        status: "error",
        businessId,
        error: apiError.code,
      });
    }

    return toErrorResponse(apiError);
  }
}

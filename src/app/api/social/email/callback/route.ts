import { ApiError, toErrorResponse } from "@/lib/api";
import { recordIntegrationError } from "@/lib/channels";
import { completeEmailConnection } from "@/lib/email";
import { verifyOAuthState } from "@/lib/integration-crypto";
import { oauthCallbackResponse } from "@/lib/oauth-redirect";

export const dynamic = "force-dynamic";

// Google redirects the browser here. The signed state binds the callback to a
// business and user; ownership is re-checked inside completeEmailConnection.
export async function GET(request: Request) {
  const url = new URL(request.url);
  let businessId: string | null = null;

  try {
    const state = verifyOAuthState(url.searchParams.get("state"));
    businessId = state.businessId;

    if (state.provider !== "gmail") {
      throw new ApiError(400, "OAUTH_PROVIDER_MISMATCH", "This state belongs to a different provider.");
    }

    if (url.searchParams.get("error")) {
      throw new ApiError(
        400,
        "EMAIL_OAUTH_DENIED",
        "Google access was cancelled or denied. Start the connection again to retry."
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new ApiError(400, "EMAIL_OAUTH_CODE_MISSING", "Google did not return an authorization code.");
    }

    const { emailAddress } = await completeEmailConnection({
      businessId: state.businessId,
      userId: state.userId,
      code,
      redirectUri: state.redirectUri,
    });

    return oauthCallbackResponse({
      integration: "email",
      status: "connected",
      businessId: state.businessId,
      details: { emailAddress },
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(500, "EMAIL_OAUTH_FAILED", "The email connection could not be completed.");

    if (businessId) {
      await recordIntegrationError(businessId, "GMAIL", "emailLastError", apiError.message);
      return oauthCallbackResponse({
        integration: "email",
        status: "error",
        businessId,
        error: apiError.code,
      });
    }

    return toErrorResponse(apiError);
  }
}

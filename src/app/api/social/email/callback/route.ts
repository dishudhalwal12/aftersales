import { errorResponse } from "../../../../../server/auth/tenant.ts";
import { recordIntegrationError } from "../../../../../server/integrations/channels.ts";
import { completeEmailConnection } from "../../../../../server/integrations/email.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { verifyOAuthState } from "../../../../../server/integrations/crypto.ts";
import { oauthCallbackResponse } from "../../../../../server/integrations/redirect.ts";

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
      throw new IntegrationError(
        400,
        "OAUTH_PROVIDER_MISMATCH",
        "This state belongs to a different provider.",
      );
    }

    if (url.searchParams.get("error")) {
      throw new IntegrationError(
        400,
        "EMAIL_OAUTH_DENIED",
        "Google access was cancelled or denied. Start the connection again to retry.",
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new IntegrationError(
        400,
        "EMAIL_OAUTH_CODE_MISSING",
        "Google did not return an authorization code.",
      );
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
    const failure =
      error instanceof IntegrationError
        ? error
        : new IntegrationError(
            500,
            "EMAIL_OAUTH_FAILED",
            "The email connection could not be completed.",
          );

    if (businessId) {
      await recordIntegrationError(businessId, "GMAIL", "emailLastError", failure.message);
      return oauthCallbackResponse({
        integration: "email",
        status: "error",
        businessId,
        error: failure.reason,
      });
    }

    return errorResponse(failure);
  }
}

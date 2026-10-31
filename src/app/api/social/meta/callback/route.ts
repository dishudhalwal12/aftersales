import { recordIntegrationError } from "../../../../../server/integrations/channels.ts";
import { verifyOAuthState } from "../../../../../server/integrations/crypto.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { META_ERROR_KEY, completeMetaAuthorization } from "../../../../../server/integrations/meta.ts";
import { oauthCallbackResponse } from "../../../../../server/integrations/redirect.ts";

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
      throw new IntegrationError(
        400,
        "OAUTH_PROVIDER_MISMATCH",
        "This state belongs to a different provider.",
      );
    }

    if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
      throw new IntegrationError(
        400,
        "META_OAUTH_DENIED",
        "Meta access was cancelled or denied. Start the connection again to retry.",
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new IntegrationError(
        400,
        "META_OAUTH_CODE_MISSING",
        "Meta did not return an authorization code.",
      );
    }

    const { assets, expiresAt } = await completeMetaAuthorization({
      businessId: state.businessId,
      userId: state.userId,
      code,
      redirectUri: state.redirectUri,
    });

    return oauthCallbackResponse(
      {
        integration: "meta",
        status: "pending_selection",
        businessId: state.businessId,
        details: { assets, pendingExpiresAt: expiresAt },
      },
      request,
    );
  } catch (error) {
    const failure =
      error instanceof IntegrationError
        ? error
        : new IntegrationError(500, "META_OAUTH_FAILED", "The Meta connection could not be completed.");

    if (businessId) {
      try {
        await recordIntegrationError(businessId, "FACEBOOK", META_ERROR_KEY, failure.message);
      } catch (recordError) {
        console.error("[oauth:meta] could not record the failure on the channel", {
          businessId,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    }

    return oauthCallbackResponse(
      {
        integration: "meta",
        status: "error",
        ...(businessId ? { businessId } : {}),
        error: failure.reason,
        httpStatus: failure.status,
        details: { message: failure.message },
      },
      request,
    );
  }
}

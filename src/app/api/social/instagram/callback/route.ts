import { recordIntegrationError } from "../../../../../server/integrations/channels.ts";
import { verifyOAuthState } from "../../../../../server/integrations/crypto.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import {
  INSTAGRAM_ERROR_KEY,
  exchangeInstagramCode,
  fetchInstagramProfile,
  saveInstagramConnection,
  subscribeInstagramAccount,
} from "../../../../../server/integrations/instagram.ts";
import { oauthCallbackResponse } from "../../../../../server/integrations/redirect.ts";

export const dynamic = "force-dynamic";

// Instagram redirects here after Business Login.
//   A. code -> short-lived token   (api.instagram.com)
//   B. short -> 60-day token       (graph.instagram.com)
//   C. subscribe comments/messages (graph.instagram.com/{id}/subscribed_apps)
//   D. encrypt + persist against the authenticated owner
export async function GET(request: Request) {
  const url = new URL(request.url);
  let businessId: string | null = null;

  try {
    const state = verifyOAuthState(url.searchParams.get("state"));
    businessId = state.businessId;

    if (state.provider !== "instagram") {
      throw new IntegrationError(
        400,
        "OAUTH_PROVIDER_MISMATCH",
        "This state belongs to a different provider.",
      );
    }

    if (url.searchParams.get("error") || url.searchParams.get("error_reason")) {
      throw new IntegrationError(
        400,
        "INSTAGRAM_OAUTH_DENIED",
        "Instagram access was cancelled or denied. Start the connection again to retry.",
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new IntegrationError(
        400,
        "INSTAGRAM_OAUTH_CODE_MISSING",
        "Instagram did not return an authorization code.",
      );
    }

    const token = await exchangeInstagramCode({
      code,
      redirectUri: state.redirectUri,
    });

    await subscribeInstagramAccount(token.userId, token.accessToken);
    const profile = await fetchInstagramProfile(token.userId, token.accessToken);

    const channel = await saveInstagramConnection({
      businessId: state.businessId,
      userId: state.userId,
      accountId: token.userId,
      username: profile.username,
      name: profile.name,
      accessToken: token.accessToken,
      expiresInSeconds: token.expiresInSeconds,
    });

    return oauthCallbackResponse(
      {
        integration: "instagram",
        status: "connected",
        businessId: state.businessId,
        details: {
          accountId: token.userId,
          username: profile.username,
          tokenExpiresAt: channel.tokenExpiresAt?.toISOString() ?? null,
        },
      },
      request,
    );
  } catch (error) {
    const failure =
      error instanceof IntegrationError
        ? error
        : new IntegrationError(
            500,
            "INSTAGRAM_OAUTH_FAILED",
            "The Instagram connection could not be completed.",
          );

    if (businessId) {
      try {
        await recordIntegrationError(businessId, "INSTAGRAM", INSTAGRAM_ERROR_KEY, failure.message);
      } catch (recordError) {
        console.error("[oauth:instagram] could not record the failure on the channel", {
          businessId,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    }

    return oauthCallbackResponse(
      {
        integration: "instagram",
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

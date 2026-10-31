import { recordIntegrationError } from "../../../../../server/integrations/channels.ts";
import { EMAIL_ERROR_KEY, completeEmailConnection } from "../../../../../server/integrations/email.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { verifyOAuthState } from "../../../../../server/integrations/crypto.ts";
import { oauthCallbackResponse } from "../../../../../server/integrations/redirect.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hard ceiling for the whole exchange+persist+profile round trip. Combined with
// the per-request provider timeout this guarantees the popup gets a response.
const CALLBACK_TIMEOUT_MS = 30_000;
const ERROR_RECORD_TIMEOUT_MS = 5_000;

function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  reason: string,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new IntegrationError(504, reason, message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Google redirects the browser here. The signed state binds the callback to a
// business and user; ownership is re-checked inside completeEmailConnection.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  let businessId: string | null = null;

  // Never log the code or the raw state: both are single-use credentials.
  console.info("[oauth:email] 1. callback hit", {
    hasCode: Boolean(code),
    hasState: Boolean(stateParam),
    providerError: providerError ?? null,
  });

  try {
    const state = verifyOAuthState(stateParam);
    businessId = state.businessId;

    if (state.provider !== "gmail") {
      throw new IntegrationError(
        400,
        "OAUTH_PROVIDER_MISMATCH",
        "This state belongs to a different provider.",
      );
    }

    if (providerError) {
      throw new IntegrationError(
        400,
        "EMAIL_OAUTH_DENIED",
        "Google access was cancelled or denied. Start the connection again to retry.",
      );
    }

    if (!code) {
      throw new IntegrationError(
        400,
        "EMAIL_OAUTH_CODE_MISSING",
        "Google did not return an authorization code.",
      );
    }

    const { emailAddress } = await withDeadline(
      completeEmailConnection({
        businessId: state.businessId,
        userId: state.userId,
        code,
        redirectUri: state.redirectUri,
        onStep: (step) => {
          if (step === "exchanging_code") {
            console.info("[oauth:email] 2. exchanging the code for tokens", {
              businessId: state.businessId,
            });
          } else {
            console.info("[oauth:email] 3. saving the connection to the database", {
              businessId: state.businessId,
            });
          }
        },
      }),
      CALLBACK_TIMEOUT_MS,
      "EMAIL_OAUTH_TIMEOUT",
      "The Gmail connection took too long. Start the connection again to retry.",
    );

    console.info("[oauth:email] 4. redirecting the browser", {
      businessId: state.businessId,
      status: "connected",
    });

    return oauthCallbackResponse(
      {
        integration: "email",
        status: "connected",
        businessId: state.businessId,
        details: { emailAddress },
      },
      request,
    );
  } catch (error) {
    const failure =
      error instanceof IntegrationError
        ? error
        : new IntegrationError(
            500,
            "EMAIL_OAUTH_FAILED",
            "The email connection could not be completed.",
          );

    console.error("[oauth:email] callback failed", {
      businessId,
      reason: failure.reason,
      status: failure.status,
      message: failure.message,
      ...(error instanceof IntegrationError
        ? {}
        : { stack: error instanceof Error ? error.stack : String(error) }),
    });

    if (businessId) {
      // Marking the channel is best effort: a database problem must never stop
      // the browser from receiving its final response.
      try {
        await withDeadline(
          recordIntegrationError(businessId, "GMAIL", EMAIL_ERROR_KEY, failure.message),
          ERROR_RECORD_TIMEOUT_MS,
          "EMAIL_OAUTH_ERROR_NOT_RECORDED",
          "Could not record the failure on the channel.",
        );
      } catch (recordError) {
        console.error("[oauth:email] could not record the failure on the channel", {
          businessId,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    }

    console.info("[oauth:email] 4. responding with the failure", {
      businessId,
      reason: failure.reason,
    });

    return oauthCallbackResponse(
      {
        integration: "email",
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

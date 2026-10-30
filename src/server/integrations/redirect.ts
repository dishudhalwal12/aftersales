// Shared response for OAuth callbacks. The backend callback always completes
// the connection first; the browser is then either returned to the configured
// frontend page or given JSON (curl/tests/local debugging).

import { NextResponse } from "next/server";

import { readFrontendRedirectUrl } from "./base-url.ts";

export type OAuthCallbackPayload = {
  integration: "email" | "meta";
  status: string;
  businessId?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export function oauthCallbackResponse(payload: OAuthCallbackPayload): NextResponse {
  const redirect = readFrontendRedirectUrl();

  if (redirect) {
    try {
      const url = new URL(redirect);
      url.searchParams.set("integration", payload.integration);
      url.searchParams.set("status", payload.status);
      if (payload.businessId) url.searchParams.set("businessId", payload.businessId);
      if (payload.error) url.searchParams.set("error", payload.error);
      return NextResponse.redirect(url);
    } catch {
      // Fall back to JSON when the configured redirect is not a valid URL.
    }
  }

  return NextResponse.json(
    {
      integration: payload.integration,
      status: payload.status,
      businessId: payload.businessId ?? null,
      ...(payload.error ? { error: payload.error } : {}),
      ...(payload.details ?? {}),
    },
    { status: payload.error ? 400 : 200 },
  );
}

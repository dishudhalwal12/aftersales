// Shared response for OAuth callbacks. The backend completes the connection
// first; the browser is then returned to the configured frontend page, given a
// small HTML page that notifies the dashboard popup, or handed JSON
// (curl/tests/local debugging).

import { NextResponse } from "next/server";

import { readFrontendRedirectUrl } from "./base-url.ts";
import {
  buildDashboardRedirectUrl,
  renderOAuthCallbackHtml,
  wantsHtmlCallback,
  type OAuthCallbackPayload,
} from "./callback-page.ts";

export type { OAuthCallbackPayload } from "./callback-page.ts";

const NO_STORE = { "cache-control": "no-store" } as const;

export function oauthCallbackResponse(
  payload: OAuthCallbackPayload,
  request?: Request,
): NextResponse {
  const redirect = readFrontendRedirectUrl();

  if (redirect) {
    try {
      const url = new URL(redirect);
      url.searchParams.set("integration", payload.integration);
      url.searchParams.set("status", payload.status);
      if (payload.businessId) url.searchParams.set("businessId", payload.businessId);
      if (payload.error) url.searchParams.set("error", payload.error);
      return NextResponse.redirect(url, { headers: NO_STORE });
    } catch {
      // Fall back to the browser page or JSON when the configured URL is invalid.
    }
  }

  // A popup/full-page navigation must never be left looking at raw JSON: the
  // dashboard popup needs a script that posts the result and closes it.
  if (request && wantsHtmlCallback(request)) {
    const dashboardUrl = buildDashboardRedirectUrl(payload, request.url);
    return new NextResponse(renderOAuthCallbackHtml(payload, dashboardUrl), {
      status: 200,
      headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json(
    {
      integration: payload.integration,
      status: payload.status,
      businessId: payload.businessId ?? null,
      ...(payload.error ? { error: payload.error } : {}),
      ...(payload.details ?? {}),
    },
    { status: payload.httpStatus ?? (payload.error ? 400 : 200), headers: NO_STORE },
  );
}

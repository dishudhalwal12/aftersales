// Pure helpers for the OAuth callback landing page. Kept free of Next.js
// imports so the markup can be unit-tested without booting a server.

import { OAUTH_CALLBACK_MESSAGE_TYPE } from "../../shared/api.ts";

export type OAuthCallbackPayload = {
  integration: "email" | "meta";
  status: string;
  businessId?: string;
  error?: string;
  // HTTP status for the JSON (non-browser) response; HTML pages always use 200.
  httpStatus?: number;
  details?: Record<string, unknown>;
};

// The dashboard listens for this exact message after `window.open`-ing the
// provider consent screen.
export { OAUTH_CALLBACK_MESSAGE_TYPE } from "../../shared/api.ts";

const INTEGRATION_LABELS: Record<OAuthCallbackPayload["integration"], string> = {
  email: "Gmail",
  meta: "Meta",
};

const DASHBOARD_PATH = "/dashboard";

// Google/Meta redirect the browser here, so the request is a top-level
// navigation and advertises `Accept: text/html`. curl/tests fall through to
// the JSON shape.
export function wantsHtmlCallback(request: Request | undefined): boolean {
  if (!request) return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

export function buildDashboardRedirectUrl(
  payload: OAuthCallbackPayload,
  requestUrl: string,
): URL | null {
  try {
    const url = new URL(DASHBOARD_PATH, requestUrl);
    if (payload.businessId) url.searchParams.set("business", payload.businessId);
    url.searchParams.set("tab", "channels");
    url.searchParams.set("integration", payload.integration);
    url.searchParams.set("status", payload.status);
    if (payload.error) url.searchParams.set("error", payload.error);
    return url;
  } catch {
    return null;
  }
}

export function buildCallbackMessage(payload: OAuthCallbackPayload): Record<string, unknown> {
  return {
    type: OAUTH_CALLBACK_MESSAGE_TYPE,
    integration: payload.integration,
    status: payload.status,
    businessId: payload.businessId ?? null,
    error: payload.error ?? null,
    ...(payload.details ?? {}),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

// `<` is escaped so a value can never terminate the inline <script> block.
function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function describeOutcome(payload: OAuthCallbackPayload): { headline: string; detail: string } {
  const label = INTEGRATION_LABELS[payload.integration];
  const failed = Boolean(payload.error) || payload.status === "error";

  if (failed) {
    const message = payload.details?.["message"];
    return {
      headline: `${label} connection failed`,
      detail:
        typeof message === "string" && message.trim()
          ? message
          : "Start the connection again to retry.",
    };
  }

  if (payload.status === "pending_selection") {
    return {
      headline: `${label} authorization received`,
      detail: "Return to the dashboard and choose the account to connect.",
    };
  }

  const emailAddress = payload.details?.["emailAddress"];
  return {
    headline: `${label} connected`,
    detail:
      typeof emailAddress === "string" && emailAddress.trim()
        ? `Connected as ${emailAddress}.`
        : "You can close this window and return to the dashboard.",
  };
}

export function renderOAuthCallbackHtml(
  payload: OAuthCallbackPayload,
  dashboardUrl: URL | null,
): string {
  const { headline, detail } = describeOutcome(payload);
  const dashboardHref = dashboardUrl?.toString() ?? DASHBOARD_PATH;
  const messageJson = serializeForScript(buildCallbackMessage(payload));
  const dashboardJson = serializeForScript(dashboardHref);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(headline)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #1f2933; }
  main { width: min(440px, calc(100vw - 48px)); padding: 32px; border-radius: 16px; background: #fff; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0 0 16px; line-height: 1.5; color: #52606d; }
  a { color: #1d4ed8; font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(headline)}</h1>
<p>${escapeHtml(detail)}</p>
<p><a href="${escapeHtml(dashboardHref)}">Return to the dashboard</a></p>
</main>
<script>
(function () {
  var payload = ${messageJson};
  var dashboard = ${dashboardJson};
  var notified = false;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      notified = true;
      window.setTimeout(function () { window.close(); }, 60);
    }
  } catch (error) {
    notified = false;
  }
  if (!notified) {
    window.setTimeout(function () { window.location.replace(dashboard); }, 600);
  }
})();
</script>
</body>
</html>
`;
}

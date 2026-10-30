// Base-URL and browser-redirect configuration shared by the OAuth routes.
// Keeping this free of Next.js imports lets the integration services stay
// unit-testable without booting a server.

export function resolveIntegrationBaseUrl(requestUrl?: string): string {
  const configured = process.env.INTEGRATIONS_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // Fall through to the error below.
    }
  }

  throw new Error(
    "INTEGRATIONS_BASE_URL is not set and the request URL could not be used as an OAuth base URL."
  );
}

// When set, the OAuth callbacks redirect the browser back to the frontend with
// a small status payload. Leave blank to return JSON (useful for curl/tests).
export function readFrontendRedirectUrl(): string | null {
  const configured = process.env.INTEGRATIONS_FRONTEND_REDIRECT_URL?.trim();
  return configured ? configured : null;
}

// Base-URL and browser-redirect configuration shared by the OAuth routes.
// Keeping this free of Next.js imports lets the integration services stay
// unit-testable without booting a server.

function isLocalOrigin(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** Vercel sets these itself; production pins the stable domain, previews get the deployment URL. */
function platformOrigin(): string | null {
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (production.length > 0) return `https://${production.replace(/\/+$/, "")}`;

  const deployment = (process.env.VERCEL_URL ?? "").trim();
  if (deployment.length > 0) return `https://${deployment.replace(/\/+$/, "")}`;

  return null;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/**
 * The public origin an external provider should call back on.
 *
 * A value copied from a laptop `.env` must never send Google or Sarvam to
 * `localhost` on a deployed host. Rules, in order:
 *   1. a non-local explicit value always wins;
 *   2. otherwise the platform's own origin (Vercel) wins;
 *   3. otherwise the request origin;
 *   4. a local explicit value is honoured only outside production;
 *   5. the caller's fallback (localhost in development).
 */
export function resolvePublicOrigin(
  configuredValue: string | undefined,
  requestUrl?: string,
  fallback = "http://localhost:3000",
): string {
  const configured = (configuredValue ?? "").trim().replace(/\/+$/, "");
  if (configured.length > 0 && !isLocalOrigin(configured)) return configured;

  const platform = platformOrigin();
  if (platform !== null) return platform;

  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // Fall through to the explicit/fallback values below.
    }
  }

  if (configured.length > 0 && !isProduction()) return configured;

  return fallback;
}

export function resolveIntegrationBaseUrl(requestUrl?: string): string {
  const resolved = resolvePublicOrigin(process.env.INTEGRATIONS_BASE_URL, requestUrl, "");
  if (resolved.length === 0) {
    throw new Error(
      "INTEGRATIONS_BASE_URL is not set and the request URL could not be used as an OAuth base URL.",
    );
  }
  return resolved;
}

// When set, the OAuth callbacks redirect the browser back to the frontend with
// a small status payload. Leave blank to return JSON (useful for curl/tests).
export function readFrontendRedirectUrl(): string | null {
  const configured = process.env.INTEGRATIONS_FRONTEND_REDIRECT_URL?.trim();
  return configured ? configured : null;
}

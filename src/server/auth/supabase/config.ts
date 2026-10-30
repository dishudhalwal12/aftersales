/**
 * Supabase configuration, read once and validated.
 *
 * Supabase is only the **Google OAuth broker** here: it proves who the person is,
 * then `app/auth/callback` maps that verified email onto a Prisma user and starts
 * the app's own signed cookie session (`auth-crypto.ts`). No Supabase token is
 * trusted after that point, so there is exactly one session system in the app.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

type Env = Record<string, string | undefined>;

/**
 * Accepted environment variable names, in priority order.
 *
 * The unprefixed pair is what a deployment should set. Vercel rejects
 * `visibility: secret` on a `NEXT_PUBLIC_*` name because those are inlined into
 * the browser bundle at build time — and nothing here is ever read by the
 * browser: the anon key only authenticates server-side API calls, so the public
 * prefix was never required. The `NEXT_PUBLIC_*` names stay supported so an
 * existing `.env` keeps working.
 */
export const SUPABASE_URL_VARS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
export const SUPABASE_KEY_VARS = ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** What to tell a human when the pair is missing — the names they must set. */
export const SUPABASE_ENV_HINT = `${SUPABASE_URL_VARS[0]} / ${SUPABASE_KEY_VARS[0]} (or the NEXT_PUBLIC_ equivalents)`;

function firstSet(env: Env, names: readonly string[]): string {
  for (const name of names) {
    const value = (env[name] ?? "").trim();
    if (value.length > 0) return value;
  }
  return "";
}

/**
 * `null` means "not configured" — callers must then say so on screen instead of
 * offering a button that cannot work.
 */
export function readSupabaseConfig(env: Env = process.env): SupabaseConfig | null {
  const url = firstSet(env, SUPABASE_URL_VARS).replace(/\/+$/, "");
  const anonKey = firstSet(env, SUPABASE_KEY_VARS);

  // Loosely validated on purpose: hosted projects are https, the local Supabase
  // CLI is http on 127.0.0.1, and both must pass.
  if (!/^https?:\/\/[^/\s]+$/.test(url) || anonKey.length < 20) return null;

  return { url, anonKey };
}

/**
 * Where this app is reachable — the origin OAuth `redirect_to` is built from.
 *
 * A deployed app must never silently send a browser to `localhost:3000`, which is exactly what
 * happened when this only read `NEXTAUTH_URL`: unset on Vercel, or still holding the local value
 * copied out of `.env`, it produced `http://localhost:3000/auth/callback` and Google dutifully
 * bounced the judge's browser there. Two rules fix it without opening a redirect hole:
 *
 *   1. an explicit `AUTH_BASE_URL` / `NEXTAUTH_URL` that names a real host always wins;
 *   2. otherwise the platform's own origin is used (`VERCEL_PROJECT_PRODUCTION_URL`, then
 *      `VERCEL_URL`) — set by the host, never by the request, so it cannot be poisoned by a
 *      `Host` header.
 *
 * A local value is still honoured in development, and as the last resort everywhere (a
 * production host that sets neither variable has to set `AUTH_BASE_URL`).
 */
export function authBaseUrl(env: Env = process.env): string {
  const explicit = firstSet(env, ["AUTH_BASE_URL", "NEXTAUTH_URL"]).replace(/\/+$/, "");
  if (explicit.length > 0 && !isLocalOrigin(explicit)) return explicit;

  const platform = platformOrigin(env);
  if (platform !== null) return platform;

  return explicit.length > 0 ? explicit : "http://localhost:3000";
}

/** Vercel sets these itself; production pins the stable domain, previews get the deployment URL. */
function platformOrigin(env: Env): string | null {
  const production = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (production.length > 0) return `https://${production.replace(/\/+$/, "")}`;

  const deployment = (env.VERCEL_URL ?? "").trim();
  if (deployment.length > 0) return `https://${deployment.replace(/\/+$/, "")}`;

  return null;
}

function isLocalOrigin(value: string): boolean {
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local")
  );
}

/**
 * Hop 2 of the handshake, and the only callback this app implements:
 * Google → https://<ref>.supabase.co/auth/v1/callback → here.
 * See docs/AUTH.md for all three URLs and where each one is configured.
 */
export function googleCallbackUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/auth/callback`;
}

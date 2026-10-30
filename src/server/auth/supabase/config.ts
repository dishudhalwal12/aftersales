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

/** Where this app is reachable. Never taken from the request origin (open redirects). */
export function authBaseUrl(env: Env = process.env): string {
  const configured = (env.NEXTAUTH_URL ?? "").trim();
  const base = configured.length > 0 ? configured : "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/**
 * Hop 2 of the handshake, and the only callback this app implements:
 * Google → https://<ref>.supabase.co/auth/v1/callback → here.
 * See docs/AUTH.md for all three URLs and where each one is configured.
 */
export function googleCallbackUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/auth/callback`;
}

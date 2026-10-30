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
 * `null` means "not configured" — callers must then say so on screen instead of
 * offering a button that cannot work.
 */
export function readSupabaseConfig(env: Env = process.env): SupabaseConfig | null {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

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

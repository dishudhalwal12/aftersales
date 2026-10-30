/**
 * Session and password primitives. Pure Node crypto, no Next.js, no database —
 * so the seed script and `node --test` can use the exact same code the server uses.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "as_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MIN_SECRET_LENGTH = 16;
const SCRYPT_KEY_LENGTH = 64;

let ephemeralSecret: Buffer | null = null;

/**
 * The signing key. Production refuses to boot without one; development falls
 * back to an in-memory secret (and says so) so a fresh clone still runs.
 */
function signingSecret(): Buffer {
  const configured = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (configured.length >= MIN_SECRET_LENGTH) return Buffer.from(configured, "utf8");

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set to at least 16 characters in production");
  }
  if (ephemeralSecret === null) {
    ephemeralSecret = randomBytes(32);
    console.warn(
      "[auth] AUTH_SECRET is unset — using an ephemeral development secret. Sessions reset on restart.",
    );
  }
  return ephemeralSecret;
}

export interface SessionPayload {
  sub: string;
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function signSessionToken(userId: string, now: number = Date.now()): string {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now: number = Date.now(),
): SessionPayload | null {
  if (typeof token !== "string") return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = sign(encoded);

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp * 1000 <= now) return null;
    return { sub: parsed.sub, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** `scrypt$<salt-hex>$<hash-hex>` — no external crypto dependency. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (typeof stored !== "string" || stored.length === 0) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

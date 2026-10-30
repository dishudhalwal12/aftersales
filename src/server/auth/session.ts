/**
 * Server-side session helpers. Everything that needs a request context (cookies)
 * or the database lives here; the crypto primitives live in `auth-crypto.ts`.
 */

import { cookies } from "next/headers";
import { prisma } from "../db.ts";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./crypto.ts";

export { SESSION_COOKIE, hashPassword, verifyPassword } from "./crypto.ts";
export type { SessionPayload } from "./crypto.ts";

export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSessionToken(userId), sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true },
  });
}

/** Post-auth redirect rule (PRD §1.3): no business -> onboarding, else dashboard. */
export async function postAuthPath(userId: string): Promise<string> {
  const count = await prisma.business.count({ where: { ownerId: userId } });
  return count === 0 ? "/onboarding" : "/dashboard";
}

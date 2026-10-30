/**
 * The one-click judge door (PRD §1.3, AT-01).
 *
 * It signs in exactly one account — the published demo owner — and nothing else.
 * A fresh database is never a dead end: if the seed has not run, the account is
 * created with the documented password, which is why the README's credentials
 * keep working either way.
 *
 * If a row already holds the demo address but its password is not the published
 * one, the address has been claimed by someone else (open sign-up allows it
 * before the seed runs). That row is refused rather than handed a session.
 *
 * `JUDGE_DEMO_LOGIN=off` closes the door for a deployment that should not offer
 * it. Anything else leaves it available.
 */

import type { User } from "@prisma/client";
import { prisma } from "../db.ts";
import { hashPassword, verifyPassword } from "./crypto.ts";
import { postAuthPath, startSession } from "./session.ts";
import { HttpError } from "./tenant.ts";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../data/demo-account.ts";

export function judgeDemoEnabled(): boolean {
  return (process.env.JUDGE_DEMO_LOGIN ?? "").trim().toLowerCase() !== "off";
}

export interface JudgeDemoSession {
  email: string;
  /** Where the browser goes next: `/dashboard` when a business exists, else `/onboarding`. */
  path: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Load the demo owner, or create it on first use. The published password is
 * hashed only on the create path — an existing row never pays for scrypt (and
 * never gets its password rewritten).
 */
async function demoOwner(): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

  if (existing !== null) {
    if (existing.passwordHash === null || !verifyPassword(DEMO_PASSWORD, existing.passwordHash)) {
      // Not the demo account, whatever its email says.
      throw new HttpError(404, "judge demo login is not available on this database");
    }
    return existing;
  }

  try {
    return await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Judge Demo",
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
    });
  } catch (error) {
    // Two clicks racing on a fresh database: the loser re-reads the winner's row.
    if (isUniqueViolation(error)) {
      const raced = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
      if (raced !== null) return raced;
    }
    throw error;
  }
}

export async function judgeDemoSignIn(): Promise<JudgeDemoSession> {
  const user = await demoOwner();

  await startSession(user.id);

  return { email: user.email, path: await postAuthPath(user.id) };
}

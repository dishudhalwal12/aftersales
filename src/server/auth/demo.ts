/**
 * The one-click judge door (PRD §1.3, AT-01).
 *
 * It signs in exactly one account — the published demo owner — and nothing else.
 * A fresh database is never a dead end: if the seed has not run, the account is
 * created with the documented password, which is why the README's credentials
 * keep working either way.
 *
 * `JUDGE_DEMO_LOGIN=off` closes the door for a deployment that should not offer
 * it. Anything else leaves it available.
 */

import { prisma } from "../db.ts";
import { hashPassword } from "./crypto.ts";
import { postAuthPath, startSession } from "./session.ts";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../data/demo-account.ts";

export function judgeDemoEnabled(): boolean {
  return (process.env.JUDGE_DEMO_LOGIN ?? "").trim().toLowerCase() !== "off";
}

export interface JudgeDemoSession {
  email: string;
  /** Where the browser goes next: `/dashboard` when a business exists, else `/onboarding`. */
  path: string;
}

export async function judgeDemoSignIn(): Promise<JudgeDemoSession> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "Judge Demo",
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
    // An existing account keeps whatever it has — this route never rewrites it.
    update: {},
  });

  await startSession(user.id);

  return { email: user.email, path: await postAuthPath(user.id) };
}

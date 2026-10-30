"use server";

import { redirect } from "next/navigation";
import { prisma } from "../../server/db.ts";
import {
  endSession,
  hashPassword,
  postAuthPath,
  startSession,
  verifyPassword,
} from "../../server/auth/session.ts";
import type { AuthState } from "./state.ts";
import {
  authBaseUrl,
  googleCallbackUrl,
  readSupabaseConfig,
  SUPABASE_ENV_HINT,
} from "../../server/auth/supabase/config.ts";
import { createSupabaseServerClient } from "../../server/auth/supabase/server.ts";

const DEMO_EMAIL = "judge@demo.aftersales.ai";

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (email.length === 0 || password.length === 0) {
    return { error: "Email and password are required." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Those credentials do not match an account." };
  }

  await startSession(user.id);
  redirect(await postAuthPath(user.id));
}

export async function signUpAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for the password." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: name.length > 0 ? name : null,
      passwordHash: hashPassword(password),
    },
  });

  await startSession(user.id);
  redirect(await postAuthPath(user.id));
}

/**
 * One-click judge login. The demo account is created on first use so a fresh
 * database is never a dead end; it owns the seeded businesses when the seed ran.
 */
export async function demoLoginAction(): Promise<void> {
  const email = DEMO_EMAIL;
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: {
        email,
        name: "Judge Demo",
        passwordHash: hashPassword(crypto.randomUUID()),
      },
    }));

  await startSession(user.id);
  redirect(await postAuthPath(user.id));
}

export async function googleSignInAction(): Promise<AuthState> {
  if (readSupabaseConfig() === null) {
    return {
      error: `Google sign-in is not configured: set ${SUPABASE_ENV_HINT}.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // The browser must reach Google, but the PKCE verifier has to land in a
      // cookie first — so we take the URL and redirect ourselves.
      skipBrowserRedirect: true,
      redirectTo: googleCallbackUrl(authBaseUrl()),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error !== null || data.url === null || data.url.length === 0) {
    return {
      error: `Google sign-in could not start: ${error?.message ?? "no authorization URL was returned."}`,
    };
  }

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

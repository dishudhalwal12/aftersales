/**
 * GET /auth/callback — the only place a Supabase identity becomes an app session.
 *
 * Flow: Google → Supabase → here (with `?code=`). We exchange the code, take the
 * verified email, find-or-create the Prisma user, and set *our* signed session
 * cookie. From this point the request is indistinguishable from a password login.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../server/db.ts";
import { postAuthPath } from "../../../server/auth/session.ts";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "../../../server/auth/crypto.ts";
import { authBaseUrl } from "../../../server/auth/supabase/config.ts";
import { createSupabaseServerClient } from "../../../server/auth/supabase/server.ts";

export const dynamic = "force-dynamic";

function backToAuth(message: string): NextResponse {
  const target = new URL("/auth", authBaseUrl());
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError =
    requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  if (code === null || code.length === 0) {
    return backToAuth(providerError ?? "Google sign-in was cancelled before it finished.");
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    return backToAuth(error instanceof Error ? error.message : "Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.trim().toLowerCase();
  if (error || email === undefined || email.length === 0) {
    return backToAuth(error?.message ?? "Google did not return an email address.");
  }

  const metadata = data.user?.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const googleId = data.user?.id ?? null;

  // An email that already has a password account keeps that password: this is a
  // second way in to the same user, not a replacement for it.
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: fullName.length > 0 ? fullName : null, googleId },
    update: { googleId },
  });

  const response = NextResponse.redirect(new URL(await postAuthPath(user.id), authBaseUrl()));
  response.cookies.set(SESSION_COOKIE, signSessionToken(user.id), sessionCookieOptions());
  return response;
}

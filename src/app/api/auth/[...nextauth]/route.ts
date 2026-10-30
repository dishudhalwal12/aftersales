import { NextResponse } from "next/server";
import { endSession, getCurrentUser } from "../../../../lib/auth.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ nextauth: string[] }> };

/**
 * Session endpoints at the PRD's `/api/auth/[...nextauth]` path.
 *
 * NOTE (honesty): this is a small signed-cookie session, not NextAuth. The path
 * is kept because the PRD freezes it; the implementation is dependency-free so
 * the repo runs with zero auth vendor keys.
 */
export async function GET(_request: Request, context: Context) {
  const { nextauth } = await context.params;
  const action = nextauth[0] ?? "session";

  if (action !== "session") {
    return NextResponse.json(
      { error: { code: 404, message: `unsupported auth action: ${action}` } },
      { status: 404 },
    );
  }

  const user = await getCurrentUser();
  return NextResponse.json({
    authenticated: user !== null,
    user,
    provider: "signed-cookie",
  });
}

export async function POST(_request: Request, context: Context) {
  const { nextauth } = await context.params;
  const action = nextauth[1] ?? nextauth[0];

  if (action !== "signout") {
    return NextResponse.json(
      { error: { code: 404, message: `unsupported auth action: ${action}` } },
      { status: 404 },
    );
  }

  await endSession();
  return NextResponse.json({ ok: true });
}

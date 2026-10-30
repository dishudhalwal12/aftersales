import { NextResponse } from "next/server";
import { judgeDemoEnabled, judgeDemoSignIn } from "../../../../server/auth/demo.ts";
import { HttpError, errorResponse } from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

/**
 * A cross-site form post must not be able to swap a visitor's session into the
 * demo account. Server actions get this check from Next; a route handler does not.
 * A request with no `Origin` (curl, the gate script) carries no ambient cookie,
 * so it is allowed through — that is how the Phase 1 gate signs in.
 */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;

  const host = request.headers.get("host");
  if (host === null) return true;

  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * POST /api/auth/judge-demo — the "1-Click Judge Demo Login" button (PRD §1.3).
 *
 * A route handler rather than a server action so the Phase 1 gate can exercise
 * it over HTTP exactly as the button does. It only ever opens the published demo
 * account; there is no parameter that could point it at another user.
 */
export async function POST(request: Request) {
  try {
    if (!judgeDemoEnabled()) {
      throw new HttpError(404, "judge demo login is disabled on this deployment");
    }
    if (isCrossSite(request)) {
      throw new HttpError(403, "cross-site judge demo login is not allowed");
    }

    const { path } = await judgeDemoSignIn();
    return NextResponse.redirect(new URL(path, request.url), 303);
  } catch (error) {
    return errorResponse(error);
  }
}

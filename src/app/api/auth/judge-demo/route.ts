import { NextResponse } from "next/server";
import { judgeDemoEnabled, judgeDemoSignIn } from "../../../../server/auth/demo.ts";
import { HttpError, errorResponse } from "../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

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

    const { path } = await judgeDemoSignIn();
    return NextResponse.redirect(new URL(path, request.url), 303);
  } catch (error) {
    return errorResponse(error);
  }
}

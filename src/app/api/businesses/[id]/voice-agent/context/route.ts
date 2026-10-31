import { NextResponse } from "next/server";
import { prisma } from "../../../../../../server/db.ts";
import {
  buildOwnerContextResponse,
  parseVoiceContextBody,
  saveVoiceAgentContext,
} from "../../../../../../server/voice/context.ts";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireUser,
} from "../../../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/businesses/[id]/voice-agent/context — the owner-facing context,
 * including the trusted identifiers and every core fact the call script uses.
 */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    return NextResponse.json(await buildOwnerContextResponse(business));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/businesses/[id]/voice-agent/context — saves the call script and the
 * number/agent mapping. Core facts are only replaced when the key is present;
 * when one changes, the brain chunks are rebuilt in the same transaction and a
 * new brain version is returned.
 */
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    const body = await readJson(request);

    const parsed = parseVoiceContextBody(body);
    const saved = await saveVoiceAgentContext(business, parsed);

    const refreshed = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    return NextResponse.json({
      ...(await buildOwnerContextResponse(refreshed)),
      recompiled: saved.recompiled,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

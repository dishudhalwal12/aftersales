import { NextResponse } from "next/server";
import {
  buildOwnerCustomizationsResponse,
  parseCustomizationUpdates,
  saveCustomizations,
} from "../../../../../../server/voice/customizations.ts";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireUser,
} from "../../../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/businesses/[id]/voice-agent/customizations — owner-only view. */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    return NextResponse.json(await buildOwnerCustomizationsResponse(business.id));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/businesses/[id]/voice-agent/customizations
 *
 * Body: `{ "customizations": { "<type>": { "isEnabled": true, "configuration": { … } } } }`
 * Only the supplied types change. Every configuration is validated before any
 * row is written, so a bad appointment policy cannot half-save availability.
 */
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    const body = await readJson(request);

    const updates = parseCustomizationUpdates(body);
    await saveCustomizations(business.id, updates);

    return NextResponse.json({
      ...(await buildOwnerCustomizationsResponse(business.id)),
      saved: updates.map((update) => update.type),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

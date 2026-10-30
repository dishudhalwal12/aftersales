import { NextResponse } from "next/server";
import { errorResponse, loadOwnedBusiness, requireUser } from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { getMetaAssetsForBusiness } from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

// Returns the Pages and linked Instagram professional accounts fetched during
// the most recent Meta authorization. Tokens are never included.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await loadOwnedBusiness(user.id, businessId);

    const result = await getMetaAssetsForBusiness(businessId, user.id);
    return NextResponse.json({
      businessId,
      assets: result.assets,
      pendingExpiresAt: result.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

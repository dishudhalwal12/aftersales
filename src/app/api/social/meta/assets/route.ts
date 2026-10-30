import { ApiError, jsonOk, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { getMetaAssetsForBusiness } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Returns the Pages and linked Instagram professional accounts fetched during
// the most recent Meta authorization. Tokens are never included.
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new ApiError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await assertBusinessOwnership(user.id, businessId);

    const result = await getMetaAssetsForBusiness(businessId, user.id);
    return jsonOk({
      businessId,
      assets: result.assets,
      pendingExpiresAt: result.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

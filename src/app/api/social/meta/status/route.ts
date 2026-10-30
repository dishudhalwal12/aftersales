import { ApiError, jsonOk, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { isIntegrationEncryptionConfigured, isOAuthStateSigningConfigured } from "@/lib/integration-crypto";
import { getMetaStatus } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new ApiError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await assertBusinessOwnership(user.id, businessId);

    const status = await getMetaStatus(businessId);
    return jsonOk({
      ...status,
      encryptionConfigured: isIntegrationEncryptionConfigured(),
      oauthStateConfigured: isOAuthStateSigningConfigured(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

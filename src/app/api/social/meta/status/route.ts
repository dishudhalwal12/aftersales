import { NextResponse } from "next/server";
import { errorResponse, loadOwnedBusiness, requireUser } from "../../../../../server/auth/tenant.ts";
import {
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
} from "../../../../../server/integrations/crypto.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { getMetaStatus } from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "businessId is required.");
    }
    await loadOwnedBusiness(user.id, businessId);

    const status = await getMetaStatus(businessId);
    return NextResponse.json({
      ...status,
      encryptionConfigured: isIntegrationEncryptionConfigured(),
      oauthStateConfigured: isOAuthStateSigningConfigured(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

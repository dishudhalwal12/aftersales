import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { selectMetaAsset } from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const kind = requireString(body, "kind", { max: 20 });
    if (kind !== "page" && kind !== "instagram") {
      throw new IntegrationError(400, "VALIDATION_ERROR", 'kind must be "page" or "instagram"');
    }
    // Instagram now connects through Instagram Login, not a Page token.
    if (kind === "instagram") {
      throw new IntegrationError(
        409,
        "INSTAGRAM_USE_LOGIN",
        "Connect Instagram from the Instagram card. This Facebook flow only links Pages.",
      );
    }
    const assetId = requireString(body, "assetId", { max: 200 });

    const result = await selectMetaAsset({
      businessId,
      userId: user.id,
      kind,
      assetId,
    });

    return NextResponse.json({
      businessId,
      provider: result.provider,
      ...result.summary,
      channelStatus: result.channel.status,
      autoSend: result.channel.autoSend,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

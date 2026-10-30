import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { sendMetaForBusiness } from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const rawChannel = requireString(body, "channel", { max: 20 }).toLowerCase();
    if (rawChannel !== "facebook" && rawChannel !== "instagram") {
      throw new IntegrationError(
        400,
        "VALIDATION_ERROR",
        'channel must be "facebook" or "instagram"',
      );
    }

    const recipientId = requireString(body, "recipientId", { max: 200 });
    const text = requireString(body, "text", { max: 2000 });

    const result = await sendMetaForBusiness({
      businessId,
      provider: rawChannel === "facebook" ? "FACEBOOK" : "INSTAGRAM",
      recipientId,
      text,
    });

    return NextResponse.json({ sent: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

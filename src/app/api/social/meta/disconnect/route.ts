import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";
import { disconnectMeta } from "../../../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const rawChannel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "all";
    if (rawChannel !== "facebook" && rawChannel !== "instagram" && rawChannel !== "all") {
      throw new IntegrationError(
        400,
        "VALIDATION_ERROR",
        'channel must be "facebook", "instagram", or "all"',
      );
    }

    const result = await disconnectMeta({ businessId, channel: rawChannel });
    return NextResponse.json({ businessId, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

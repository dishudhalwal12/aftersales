import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { disconnectInstagram } from "../../../../../server/integrations/instagram.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const result = await disconnectInstagram({ businessId });
    return NextResponse.json({ businessId, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

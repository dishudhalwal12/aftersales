import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { disconnectEmail } from "../../../../../server/integrations/email.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const channel = await disconnectEmail(businessId);
    return NextResponse.json({
      businessId,
      connected: false,
      status: "disconnected",
      channelStatus: channel.status,
      autoSend: channel.autoSend,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

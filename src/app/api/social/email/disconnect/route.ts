import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { disconnectEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const disconnectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = disconnectSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const channel = await disconnectEmail(body.businessId);
    return jsonOk({
      businessId: body.businessId,
      connected: false,
      status: "disconnected",
      channelStatus: channel.status,
      autoSend: channel.autoSend,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

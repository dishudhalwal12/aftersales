import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { sendMetaForBusiness } from "@/lib/meta";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  channel: z.enum(["facebook", "instagram"]),
  recipientId: z.string().trim().min(1, "recipientId is required.").max(200),
  text: z.string().trim().min(1, "text is required.").max(2000),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = sendSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const result = await sendMetaForBusiness({
      businessId: body.businessId,
      provider: body.channel === "facebook" ? "FACEBOOK" : "INSTAGRAM",
      recipientId: body.recipientId,
      text: body.text,
    });

    return jsonOk({ sent: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

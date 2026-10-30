import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { disconnectMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

const disconnectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  channel: z.enum(["facebook", "instagram", "all"]).default("all"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = disconnectSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const result = await disconnectMeta({
      businessId: body.businessId,
      channel: body.channel,
    });

    return jsonOk({ businessId: body.businessId, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

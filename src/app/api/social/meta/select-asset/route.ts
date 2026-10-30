import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { selectMetaAsset } from "@/lib/meta";

export const dynamic = "force-dynamic";

const selectSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  kind: z.enum(["page", "instagram"]),
  assetId: z.string().trim().min(1, "assetId is required.").max(200),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = selectSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const result = await selectMetaAsset({
      businessId: body.businessId,
      userId: user.id,
      kind: body.kind,
      assetId: body.assetId,
    });

    return jsonOk({
      businessId: body.businessId,
      provider: result.provider,
      ...result.summary,
      channelStatus: result.channel.status,
      autoSend: result.channel.autoSend,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

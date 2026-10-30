import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { triageInboundMessage } from "@/lib/triage";

export const dynamic = "force-dynamic";

const textQuerySchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  customerName: z.string().trim().min(1).max(120).default("Judge Tester"),
  customerHandle: z.string().trim().min(1).max(200).default("judge@sphinx.demo"),
  channel: z
    .enum(["TEXT_MODAL", "WHATSAPP", "INSTAGRAM", "GMAIL", "VOICE"])
    .default("TEXT_MODAL"),
  query: z.string().trim().min(1, "Query is required.").max(2000),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = textQuerySchema.parse(await parseJsonBody(request));

    const business = await assertBusinessOwnership(user.id, body.businessId);

    const result = await triageInboundMessage({
      business,
      query: body.query,
      channel: body.channel,
      customerName: body.customerName,
      customerHandle: body.customerHandle,
    });

    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

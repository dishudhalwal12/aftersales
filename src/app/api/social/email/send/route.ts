import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { sendEmailForBusiness } from "@/lib/email";

export const dynamic = "force-dynamic";

const headerPattern = /^[^\r\n]{1,400}$/;

const sendSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  to: z.string().trim().toLowerCase().email("A valid recipient email is required."),
  subject: z.string().trim().min(1, "Subject is required.").max(200).regex(headerPattern),
  text: z.string().trim().min(1, "Message text is required.").max(20_000),
  threadId: z.string().trim().min(1).max(200).optional(),
  inReplyTo: z.string().trim().min(1).max(400).regex(headerPattern).optional(),
  references: z.string().trim().min(1).max(2000).regex(headerPattern).optional(),
});

// Owner-initiated send (testing, manual follow-up). Agent replies use the same
// service from the inbound pipeline.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = sendSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);

    const result = await sendEmailForBusiness(body.businessId, {
      to: body.to,
      subject: body.subject,
      text: body.text,
      threadId: body.threadId,
      inReplyTo: body.inReplyTo,
      references: body.references,
    });

    return jsonOk({ sent: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

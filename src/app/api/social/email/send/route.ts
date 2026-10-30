import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { sendEmailForBusiness } from "../../../../../server/integrations/email.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";

export const dynamic = "force-dynamic";

const headerPattern = /^[^\r\n]{1,400}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalHeader(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !headerPattern.test(value.trim())) {
    throw new IntegrationError(400, "VALIDATION_ERROR", `field "${key}" is not a valid header value`);
  }
  return value.trim();
}

// Owner-initiated send (testing, manual follow-up). Agent replies use the same
// service from the inbound pipeline.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);

    const to = requireString(body, "to", { max: 320 }).toLowerCase();
    if (!emailPattern.test(to)) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "A valid recipient email is required.");
    }

    const subject = requireString(body, "subject", { max: 200 });
    if (!headerPattern.test(subject)) {
      throw new IntegrationError(400, "VALIDATION_ERROR", "Subject must be a single line.");
    }
    const text = requireString(body, "text", { max: 20_000 });

    const threadIdValue = body.threadId;
    const threadId =
      typeof threadIdValue === "string" && threadIdValue.trim()
        ? threadIdValue.trim().slice(0, 200)
        : undefined;

    const result = await sendEmailForBusiness(businessId, {
      to,
      subject,
      text,
      threadId,
      inReplyTo: optionalHeader(body, "inReplyTo"),
      references: optionalHeader(body, "references"),
    });

    return NextResponse.json({ sent: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

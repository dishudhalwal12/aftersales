import { z } from "zod";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { ensureChannelConnection } from "@/lib/channels";
import { isEmailProviderSupported, readEmailProviderSettings } from "@/lib/email";

export const dynamic = "force-dynamic";

const credentialsSchema = z.object({
  businessId: z.string().trim().min(1, "businessId is required."),
  provider: z.string().trim().min(1).max(40).optional(),
  credentials: z.record(z.string()).optional(),
});

// Reserved for API-key providers (SendGrid, Mailgun, ...). Gmail uses OAuth,
// so it rejects this endpoint instead of accepting a mailbox password. No
// provider keys are accepted or stored until a provider implementation exists.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = credentialsSchema.parse(await parseJsonBody(request));
    await assertBusinessOwnership(user.id, body.businessId);
    await ensureChannelConnection(body.businessId, "GMAIL");

    const provider = (body.provider ?? readEmailProviderSettings().provider).toLowerCase();

    if (provider === "gmail") {
      throw new ApiError(
        400,
        "EMAIL_OAUTH_REQUIRED",
        "Gmail connects with OAuth. Use POST /api/social/email/connect instead."
      );
    }

    throw new ApiError(
      400,
      "EMAIL_PROVIDER_NOT_SUPPORTED",
      "No API-key email provider is implemented in this deployment.",
      { supported: ["gmail"] }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

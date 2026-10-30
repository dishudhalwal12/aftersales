import { NextResponse } from "next/server";
import {
  errorResponse,
  loadOwnedBusiness,
  readJson,
  requireString,
  requireUser,
} from "../../../../../server/auth/tenant.ts";
import { ensureChannelConnection } from "../../../../../server/integrations/channels.ts";
import { readEmailProviderSettings } from "../../../../../server/integrations/email.ts";
import { IntegrationError } from "../../../../../server/integrations/errors.ts";

export const dynamic = "force-dynamic";

// Reserved for API-key providers (SendGrid, Mailgun, ...). Gmail uses OAuth,
// so it rejects this endpoint instead of accepting a mailbox password. No
// provider keys are accepted or stored until a provider implementation exists.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    const businessId = requireString(body, "businessId", { max: 100 });
    await loadOwnedBusiness(user.id, businessId);
    await ensureChannelConnection(businessId, "GMAIL");

    const requested = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
    const provider = requested || readEmailProviderSettings().provider;

    if (provider === "gmail") {
      throw new IntegrationError(
        400,
        "EMAIL_OAUTH_REQUIRED",
        "Gmail connects with OAuth. Use POST /api/social/email/connect instead.",
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 400,
          message: "No API-key email provider is implemented in this deployment.",
          supported: ["gmail"],
        },
      },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

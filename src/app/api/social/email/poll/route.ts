import { NextResponse } from "next/server";
import { errorResponse } from "../../../../../server/auth/tenant.ts";
import { assertCronSecret } from "../../../../../server/integrations/cron.ts";
import { pollConnectedEmailInboxes } from "../../../../../server/integrations/email.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Call from Vercel Cron (or any scheduler) with the CRON_SECRET. Polls every
// connected mailbox, runs the shared triage pipeline, and replies in-thread.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await pollConnectedEmailInboxes();
    return NextResponse.json({
      polledAt: new Date().toISOString(),
      businesses: result.businesses.length,
      summaries: result.businesses,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = GET;

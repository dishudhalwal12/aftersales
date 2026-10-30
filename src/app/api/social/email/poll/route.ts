import { jsonOk, toErrorResponse } from "@/lib/api";
import { assertCronSecret } from "@/lib/cron";
import { pollConnectedEmailInboxes } from "@/lib/email";

export const dynamic = "force-dynamic";

// Call from Vercel Cron (or any scheduler) with the CRON_SECRET. Polls every
// connected mailbox, runs the existing triage pipeline, and replies in-thread.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await pollConnectedEmailInboxes();
    return jsonOk({
      polledAt: new Date().toISOString(),
      businesses: result.businesses.length,
      summaries: result.businesses,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = GET;

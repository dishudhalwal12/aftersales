import { ApiError, toErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

// Gmail does not push to arbitrary URLs: real-time delivery needs Google Cloud
// Pub/Sub plus a workspace topic. This deployment polls instead
// (GET /api/social/email/poll). Returning 501 is deliberate — accepting a
// webhook here would imply a delivery mode that is not actually configured.
export async function POST() {
  try {
    throw new ApiError(
      501,
      "EMAIL_WEBHOOK_NOT_SUPPORTED",
      "Gmail delivery uses polling in this deployment. Configure a scheduler to call GET /api/social/email/poll."
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

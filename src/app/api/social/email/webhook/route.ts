import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Gmail does not push to arbitrary URLs: real-time delivery needs Google Cloud
// Pub/Sub plus a workspace topic. This deployment polls instead
// (GET /api/social/email/poll). Returning 501 is deliberate — accepting a
// webhook here would imply a delivery mode that is not actually configured.
export function POST() {
  return NextResponse.json(
    {
      error: {
        code: 501,
        message:
          "Gmail delivery uses polling in this deployment. Configure a scheduler to call GET /api/social/email/poll.",
      },
    },
    { status: 501 },
  );
}

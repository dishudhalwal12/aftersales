import { NextResponse } from "next/server";
import { errorResponse } from "../../../../server/auth/tenant.ts";
import { assertCronSecret } from "../../../../server/integrations/cron.ts";
import { generateWeeklyReportsForAll } from "../../../../server/business/weekly-report-store.ts";
import { prismaWeeklyReportStore } from "../../../../server/business/weekly-report-store-prisma.ts";

export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/weekly-insights — finalise the last completed ISO week for
 * every business.
 *
 * Vercel Cron calls this on a schedule (`vercel.json`, Mondays 00:05 UTC) with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler may use the same
 * sender or `x-cron-secret`. The sweep is idempotent on `(businessId, weekStart)`
 * and reports per-business failures without aborting the rest.
 */
async function run(request: Request) {
  try {
    assertCronSecret(request);
    const result = await generateWeeklyReportsForAll(prismaWeeklyReportStore, new Date());
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = run;
export const POST = run;

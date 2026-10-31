import { NextResponse } from "next/server";
import { prisma } from "../../../../../server/db.ts";
import { buildInsights, type InsightTicket } from "../../../../../server/business/insights.ts";
import {
  DAY_MS,
  trackSentiment,
  weekWindow,
} from "../../../../../server/business/weekly-report.ts";
import {
  ensureWeeklyReport,
  readWeeklyHistory,
} from "../../../../../server/business/weekly-report-store.ts";
import { prismaWeeklyReportStore } from "../../../../../server/business/weekly-report-store-prisma.ts";
import type { WeeklyReportView } from "../../../../../shared/api.ts";
import {
  errorResponse,
  loadOwnedBusiness,
  requireUser,
} from "../../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const WINDOW_DAYS = 7;
const LOOKBACK_DAYS = 30;
const HISTORY_LIMIT = 6;

/**
 * GET /api/businesses/[id]/insights — rolling sentiment tracking plus the
 * completed-week report.
 *
 * The weekly report is materialised here when it is missing (trigger `lazy`),
 * so the feature works on a deployment with no scheduler; `vercel.json` runs
 * the same generation through the secret-gated cron route. A persistence
 * failure degrades to `weeklyReport: null` instead of breaking the read.
 */
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);

    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
    const tickets = await prisma.ticket.findMany({
      where: { businessId: business.id, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const rows: InsightTicket[] = tickets.map((ticket) => ({
      id: ticket.id,
      channel: ticket.channel,
      sentiment: ticket.sentiment,
      actionStatus: ticket.actionStatus,
      routingRuleHit: ticket.routingRuleHit,
      intent: ticket.intent,
      customerQuery: ticket.customerQuery,
      citedChunkIds: ticket.citedChunkIds,
      createdAt: ticket.createdAt,
    }));

    const report = buildInsights(rows, now, WINDOW_DAYS);
    const tracking = trackSentiment(rows, now, WINDOW_DAYS);
    const { weeklyReport, weeklyHistory } = await automaticReport(business.id, now);

    return NextResponse.json({
      businessId: business.id,
      ...report,
      sentimentScore: tracking.score,
      previousSentimentScore: tracking.previousScore,
      sentimentDelta: tracking.delta,
      sentimentTrend: tracking.trend,
      negativeShare: tracking.negativeShare,
      dailySentiment: tracking.daily,
      weeklyReport,
      weeklyHistory,
      nextReportAt: weekWindow(now).end.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function automaticReport(
  businessId: string,
  now: Date,
): Promise<{ weeklyReport: WeeklyReportView | null; weeklyHistory: WeeklyReportView[] }> {
  let weeklyReport: WeeklyReportView | null = null;
  let weeklyHistory: WeeklyReportView[] = [];

  try {
    const generated = await ensureWeeklyReport(prismaWeeklyReportStore, businessId, now, "lazy");
    weeklyReport = {
      ...generated.report,
      generatedAt: generated.stored.generatedAt.toISOString(),
      trigger: generated.stored.trigger,
    };
  } catch (error) {
    console.error(
      `[insights] weekly report could not be generated for ${businessId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    weeklyHistory = await readWeeklyHistory(prismaWeeklyReportStore, businessId, HISTORY_LIMIT);
  } catch (error) {
    console.error(
      `[insights] weekly report history could not be read for ${businessId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  return { weeklyReport, weeklyHistory };
}

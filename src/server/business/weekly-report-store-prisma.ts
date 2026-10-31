/**
 * Prisma adapter for the weekly insights report. The only file in this feature
 * that imports `@prisma/client`; every rule lives in `weekly-report-store.ts`.
 */

import type { WeeklyInsightReport } from "@prisma/client";
import { prisma } from "../db.ts";
import type {
  StoredWeeklyReportRow,
  WeeklyReportStore,
  WeeklyReportTrigger,
  WeeklyReportWrite,
} from "./weekly-report-store.ts";

const TICKET_SELECT = {
  id: true,
  channel: true,
  sentiment: true,
  actionStatus: true,
  routingRuleHit: true,
  intent: true,
  customerQuery: true,
  citedChunkIds: true,
  createdAt: true,
} as const;

export const prismaWeeklyReportStore: WeeklyReportStore = {
  async findTickets({ businessId, from, to }) {
    return prisma.ticket.findMany({
      where: { businessId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
      select: TICKET_SELECT,
    });
  },

  async findReport({ businessId, weekStart }) {
    const row = await prisma.weeklyInsightReport.findUnique({
      where: { businessId_weekStart: { businessId, weekStart } },
    });
    return row === null ? null : toStored(row);
  },

  async saveReport(write) {
    const { businessId, weekStart, weekEnd: _weekEnd, ...rest } = write;
    const row = await prisma.weeklyInsightReport.upsert({
      where: { businessId_weekStart: { businessId, weekStart } },
      create: write,
      update: rest,
    });
    return toStored(row);
  },

  async listReportHistory({ businessId, limit }) {
    const rows = await prisma.weeklyInsightReport.findMany({
      where: { businessId },
      orderBy: { weekStart: "desc" },
      take: limit,
    });
    return rows.map(toStored);
  },

  async listBusinessIds() {
    const rows = await prisma.business.findMany({ select: { id: true } });
    return rows.map((row) => row.id);
  },
};

function toTrigger(value: string): WeeklyReportTrigger {
  return value === "cron" ? "cron" : "lazy";
}

function toStored(row: WeeklyInsightReport): StoredWeeklyReportRow {
  return {
    id: row.id,
    businessId: row.businessId,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    generatedAt: row.generatedAt,
    trigger: toTrigger(row.trigger),
    totalTickets: row.totalTickets,
    autoAnswered: row.autoAnswered,
    drafts: row.drafts,
    escalated: row.escalated,
    failed: row.failed,
    escalationRate: row.escalationRate,
    autoAnswerRate: row.autoAnswerRate,
    positive: row.positive,
    neutral: row.neutral,
    frustrated: row.frustrated,
    distressed: row.distressed,
    sentimentScore: row.sentimentScore,
    previousScore: row.previousScore,
    sentimentTrend: row.sentimentTrend,
    topComplaintIntent: row.topComplaintIntent,
    topComplaintCount: row.topComplaintCount,
    payloadJson: row.payloadJson,
  };
}

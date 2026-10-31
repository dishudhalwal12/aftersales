/**
 * Persistence rules for the automatic weekly insights report.
 *
 * `WeeklyReportStore` is the whole database surface this feature needs;
 * `weekly-report-store-prisma.ts` is the only implementation that touches
 * Prisma. Unit tests drive an in-memory fake, so idempotency and the sweep's
 * partial-failure behaviour are proven without a database.
 */

import {
  buildWeeklyReport,
  weekWindow,
  type ReportTicket,
  type WeeklyReport,
} from "./weekly-report.ts";

export type WeeklyReportTrigger = "cron" | "lazy";

/** The queryable summary plus the full report payload. */
export interface WeeklyReportWrite {
  businessId: string;
  weekStart: Date;
  weekEnd: Date;
  generatedAt: Date;
  trigger: WeeklyReportTrigger;
  totalTickets: number;
  autoAnswered: number;
  drafts: number;
  escalated: number;
  failed: number;
  escalationRate: number;
  autoAnswerRate: number;
  positive: number;
  neutral: number;
  frustrated: number;
  distressed: number;
  sentimentScore: number;
  previousScore: number | null;
  sentimentTrend: string;
  topComplaintIntent: string | null;
  topComplaintCount: number;
  payloadJson: string;
}

export interface StoredWeeklyReportRow extends WeeklyReportWrite {
  id: string;
}

/** What the API and the dashboard render: the report plus its provenance. */
export interface StoredWeeklyReportView extends WeeklyReport {
  generatedAt: string;
  trigger: WeeklyReportTrigger;
}

export interface WeeklyReportStore {
  findTickets(input: { businessId: string; from: Date; to: Date }): Promise<ReportTicket[]>;
  findReport(input: {
    businessId: string;
    weekStart: Date;
  }): Promise<StoredWeeklyReportRow | null>;
  saveReport(write: WeeklyReportWrite): Promise<StoredWeeklyReportRow>;
  listReportHistory(input: {
    businessId: string;
    limit: number;
  }): Promise<StoredWeeklyReportRow[]>;
  listBusinessIds(): Promise<string[]>;
}

export interface GeneratedWeeklyReport {
  /** True only when this call created the row; false when it already existed. */
  created: boolean;
  stored: StoredWeeklyReportRow;
  report: WeeklyReport;
}

export interface WeeklySweepResult {
  weekStart: string;
  weekEnd: string;
  businesses: number;
  created: number;
  existing: number;
  failures: { businessId: string; message: string }[];
  results: { businessId: string; ok: boolean; created: boolean }[];
}

export function toWeeklyReportWrite(input: {
  businessId: string;
  report: WeeklyReport;
  trigger: WeeklyReportTrigger;
  generatedAt: Date;
}): WeeklyReportWrite {
  const { report } = input;
  return {
    businessId: input.businessId,
    weekStart: new Date(report.weekStart),
    weekEnd: new Date(report.weekEnd),
    generatedAt: input.generatedAt,
    trigger: input.trigger,
    totalTickets: report.totalTickets,
    autoAnswered: report.autoAnswered,
    drafts: report.drafts,
    escalated: report.escalated,
    failed: report.failed,
    escalationRate: report.escalationRate,
    autoAnswerRate: report.autoAnswerRate,
    positive: report.sentiment.positive,
    neutral: report.sentiment.neutral,
    frustrated: report.sentiment.frustrated,
    distressed: report.sentiment.distressed,
    sentimentScore: report.sentimentScore,
    previousScore: report.previousScore,
    sentimentTrend: report.sentimentTrend,
    topComplaintIntent: report.topComplaint,
    topComplaintCount: report.recurringComplaints[0]?.count ?? 0,
    payloadJson: JSON.stringify(report),
  };
}

/** Rebuild the report from its stored payload, failing loudly on corrupt data. */
export function parseStoredReport(row: StoredWeeklyReportRow): WeeklyReport {
  try {
    const parsed: unknown = JSON.parse(row.payloadJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("payload is not an object");
    }
    const report = parsed as WeeklyReport;
    if (typeof report.weekStart !== "string" || typeof report.weekEnd !== "string") {
      throw new Error("payload is missing its week");
    }
    return report;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `weekly report ${row.businessId}@${row.weekStart.toISOString()} has an unreadable payload: ${reason}`,
    );
  }
}

/**
 * Build and upsert the last completed week's report. The upsert key is
 * `(businessId, weekStart)`, so a retry can never create a second row.
 */
export async function generateWeeklyReport(
  store: WeeklyReportStore,
  businessId: string,
  now: Date,
  trigger: WeeklyReportTrigger,
): Promise<GeneratedWeeklyReport> {
  const window = weekWindow(now, 1);
  const previousWindow = weekWindow(now, 2);
  const rows = await store.findTickets({
    businessId,
    from: previousWindow.start,
    to: window.end,
  });
  const report = buildWeeklyReport({ tickets: rows, previousTickets: rows, now });
  const existing = await store.findReport({ businessId, weekStart: window.start });
  const stored = await store.saveReport(
    toWeeklyReportWrite({ businessId, report, trigger, generatedAt: now }),
  );
  return { created: existing === null, stored, report };
}

/**
 * The automatic path: materialise the completed week only if it is missing.
 * An existing report is returned untouched — completed weeks are snapshots.
 */
export async function ensureWeeklyReport(
  store: WeeklyReportStore,
  businessId: string,
  now: Date,
  trigger: WeeklyReportTrigger = "lazy",
): Promise<GeneratedWeeklyReport> {
  const window = weekWindow(now, 1);
  const existing = await store.findReport({ businessId, weekStart: window.start });
  if (existing !== null) {
    return { created: false, stored: existing, report: parseStoredReport(existing) };
  }
  return generateWeeklyReport(store, businessId, now, trigger);
}

export async function readWeeklyHistory(
  store: WeeklyReportStore,
  businessId: string,
  limit = 4,
): Promise<StoredWeeklyReportView[]> {
  const rows = await store.listReportHistory({ businessId, limit });
  return rows.map((row) => ({
    ...parseStoredReport(row),
    generatedAt: row.generatedAt.toISOString(),
    trigger: row.trigger,
  }));
}

/**
 * The scheduler path: one completed-week report per business. A business that
 * fails is reported and the sweep keeps going, so one broken row never blocks
 * every other tenant's report.
 */
export async function generateWeeklyReportsForAll(
  store: WeeklyReportStore,
  now: Date,
): Promise<WeeklySweepResult> {
  const window = weekWindow(now, 1);
  const businessIds = await store.listBusinessIds();
  const results: WeeklySweepResult["results"] = [];
  const failures: WeeklySweepResult["failures"] = [];

  for (const businessId of businessIds) {
    try {
      const generated = await ensureWeeklyReport(store, businessId, now, "cron");
      results.push({ businessId, ok: true, created: generated.created });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ businessId, ok: false, created: false });
      failures.push({ businessId, message });
    }
  }

  return {
    weekStart: window.start.toISOString(),
    weekEnd: window.end.toISOString(),
    businesses: businessIds.length,
    created: results.filter((result) => result.ok && result.created).length,
    existing: results.filter((result) => result.ok && !result.created).length,
    failures,
    results,
  };
}

/**
 * Week-aligned insights report + rolling sentiment tracking (PRD bonus twist).
 *
 * Pure: rows in, report out. The only clock is the `now` argument, so every
 * boundary is testable and the store/route/UI share one contract.
 *
 * Weeks are ISO weeks in UTC: Monday 00:00:00Z inclusive → next Monday
 * exclusive. A "completed week" is the previous Monday–Sunday window.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_DAYS = 7;
export const MAX_COMPLAINTS = 5;
export const TREND_THRESHOLD = 5;

export type Sentiment = "positive" | "neutral" | "frustrated" | "distressed";

type SentimentWeights = Readonly<Record<Sentiment, number>>;

/** Positive is 100, distressed is 0, so one number can be tracked across weeks. */
export const SENTIMENT_WEIGHTS: SentimentWeights = {
  positive: 100,
  neutral: 50,
  frustrated: 20,
  distressed: 0,
};

const SENTIMENTS: readonly Sentiment[] = ["positive", "neutral", "frustrated", "distressed"];
const NEGATIVE = new Set<string>(["frustrated", "distressed"]);

export interface ReportTicket {
  id: string;
  channel: string;
  sentiment: string;
  actionStatus: string;
  routingRuleHit: string;
  intent: string;
  customerQuery: string;
  citedChunkIds: string;
  createdAt: Date;
}

export interface SentimentCounts {
  positive: number;
  neutral: number;
  frustrated: number;
  distressed: number;
}

export type SentimentTrend = "improving" | "stable" | "worsening" | "baseline";

export interface DailySentiment {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  total: number;
  negative: number;
  negativeShare: number;
}

export interface ComplaintEntry {
  intent: string;
  count: number;
  negative: number;
  negativeShare: number;
  previousCount: number;
  delta: number;
  direction: "new" | "rising" | "cooling" | "steady";
  sample: string;
  lastSeen: string;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  windowDays: number;
  totalTickets: number;
  autoAnswered: number;
  drafts: number;
  escalated: number;
  failed: number;
  escalationRate: number;
  autoAnswerRate: number;
  sentiment: SentimentCounts;
  sentimentScore: number;
  previousScore: number | null;
  sentimentDelta: number;
  sentimentTrend: SentimentTrend;
  dailySentiment: DailySentiment[];
  recurringComplaints: ComplaintEntry[];
  topComplaint: string | null;
  citations: number;
}

export interface SentimentTracking {
  windowDays: number;
  score: number;
  previousScore: number | null;
  delta: number;
  trend: SentimentTrend;
  negativeShare: number;
  total: number;
  sentiment: SentimentCounts;
  daily: DailySentiment[];
}

/** The ISO week containing `now`, optionally stepped back whole weeks. */
export function weekWindow(now: Date, weeksAgo = 0): { start: Date; end: Date } {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
  const start = dayStart - sinceMonday * DAY_MS - weeksAgo * WEEK_DAYS * DAY_MS;
  return { start: new Date(start), end: new Date(start + WEEK_DAYS * DAY_MS) };
}

export function sentimentScore(counts: SentimentCounts): number {
  const total = SENTIMENTS.reduce((sum, key) => sum + counts[key], 0);
  if (total === 0) return 0;
  const weighted = SENTIMENTS.reduce((sum, key) => sum + counts[key] * SENTIMENT_WEIGHTS[key], 0);
  return Math.round(weighted / total);
}

export function sentimentTrendFor(current: number, previous: number | null): SentimentTrend {
  if (previous === null) return "baseline";
  const delta = current - previous;
  if (delta >= TREND_THRESHOLD) return "improving";
  if (delta <= -TREND_THRESHOLD) return "worsening";
  return "stable";
}

/** Rolling sentiment tracking for the last `windowDays`, compared with the span before it. */
export function trackSentiment(
  tickets: readonly ReportTicket[],
  now: Date,
  windowDays = WEEK_DAYS,
): SentimentTracking {
  const span = windowDays * DAY_MS;
  const nowMs = now.getTime();
  const current = tickets.filter((ticket) => {
    const at = ticket.createdAt.getTime();
    return at > nowMs - span && at <= nowMs;
  });
  const previous = tickets.filter((ticket) => {
    const at = ticket.createdAt.getTime();
    return at > nowMs - 2 * span && at <= nowMs - span;
  });

  const sentiment = countSentiments(current);
  const previousSentiment = countSentiments(previous);
  const score = sentimentScore(sentiment);
  const previousScore = knownTotal(previousSentiment) === 0 ? null : sentimentScore(previousSentiment);

  const negative = current.filter((ticket) => NEGATIVE.has(ticket.sentiment)).length;
  const today = utcDayStart(now);
  const firstDay = new Date(today.getTime() - (WEEK_DAYS - 1) * DAY_MS);

  return {
    windowDays,
    score,
    previousScore,
    delta: previousScore === null ? 0 : score - previousScore,
    trend: sentimentTrendFor(score, previousScore),
    negativeShare: current.length === 0 ? 0 : Math.round((negative / current.length) * 100),
    total: current.length,
    sentiment,
    daily: dailySeries(current, firstDay, WEEK_DAYS),
  };
}

/**
 * The report for the last completed ISO week.
 *
 * `tickets` and `previousTickets` may include rows outside their windows; both
 * are filtered here so a caller cannot widen the report by accident.
 */
export function buildWeeklyReport(input: {
  tickets: readonly ReportTicket[];
  previousTickets: readonly ReportTicket[];
  now: Date;
}): WeeklyReport {
  const window = weekWindow(input.now, 1);
  const previousWindow = weekWindow(input.now, 2);
  const inWeek = input.tickets.filter((ticket) => isWithin(ticket.createdAt, window));
  const previousWeek = input.previousTickets.filter((ticket) =>
    isWithin(ticket.createdAt, previousWindow),
  );

  const sentiment = countSentiments(inWeek);
  const previousSentiment = countSentiments(previousWeek);
  const score = sentimentScore(sentiment);
  const previousScore =
    knownTotal(previousSentiment) === 0 ? null : sentimentScore(previousSentiment);

  const outcomes = countOutcomes(inWeek);
  const total = inWeek.length;
  const percent = (part: number) => (total === 0 ? 0 : Math.round((part / total) * 100));
  const recurringComplaints = buildComplaints(inWeek, previousWeek);

  return {
    weekStart: window.start.toISOString(),
    weekEnd: window.end.toISOString(),
    windowDays: WEEK_DAYS,
    totalTickets: total,
    autoAnswered: outcomes.autoAnswered,
    drafts: outcomes.drafts,
    escalated: outcomes.escalated,
    failed: outcomes.failed,
    escalationRate: percent(outcomes.escalated),
    autoAnswerRate: percent(outcomes.autoAnswered),
    sentiment,
    sentimentScore: score,
    previousScore,
    sentimentDelta: previousScore === null ? 0 : score - previousScore,
    sentimentTrend: sentimentTrendFor(score, previousScore),
    dailySentiment: dailySeries(inWeek, window.start, WEEK_DAYS),
    recurringComplaints,
    topComplaint: recurringComplaints[0]?.intent ?? null,
    citations: inWeek.filter((ticket) => hasCitations(ticket.citedChunkIds)).length,
  };
}

function isWithin(at: Date, window: { start: Date; end: Date }): boolean {
  const time = at.getTime();
  return time >= window.start.getTime() && time < window.end.getTime();
}

function utcDayStart(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

function countSentiments(rows: readonly ReportTicket[]): SentimentCounts {
  const counts: SentimentCounts = { positive: 0, neutral: 0, frustrated: 0, distressed: 0 };
  for (const row of rows) {
    if (isSentiment(row.sentiment)) counts[row.sentiment] += 1;
  }
  return counts;
}

function isSentiment(value: string): value is Sentiment {
  return (SENTIMENTS as readonly string[]).includes(value);
}

function knownTotal(counts: SentimentCounts): number {
  return SENTIMENTS.reduce((sum, key) => sum + counts[key], 0);
}

function countOutcomes(rows: readonly ReportTicket[]) {
  const outcomes = { autoAnswered: 0, drafts: 0, escalated: 0, failed: 0 };
  for (const row of rows) {
    if (row.actionStatus === "answered") outcomes.autoAnswered += 1;
    else if (row.actionStatus === "draft") outcomes.drafts += 1;
    else if (row.actionStatus === "escalated") outcomes.escalated += 1;
    else outcomes.failed += 1;
  }
  return outcomes;
}

function hasCitations(citedChunkIds: string): boolean {
  const trimmed = citedChunkIds.trim();
  return trimmed !== "" && trimmed !== "[]";
}

/** Seven zero-filled UTC days starting at `start`, so the series is always a clean week. */
function dailySeries(
  rows: readonly ReportTicket[],
  start: Date,
  days: number,
): DailySentiment[] {
  const buckets = Array.from({ length: days }, (_unused, index) => ({
    date: new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    total: 0,
    negative: 0,
    negativeShare: 0,
  }));

  for (const row of rows) {
    const index = Math.floor((row.createdAt.getTime() - start.getTime()) / DAY_MS);
    if (index < 0 || index >= days) continue;
    const bucket = buckets[index];
    if (bucket === undefined) continue;
    bucket.total += 1;
    if (NEGATIVE.has(row.sentiment)) bucket.negative += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    negativeShare: bucket.total === 0 ? 0 : Math.round((bucket.negative / bucket.total) * 100),
  }));
}

interface ComplaintAccumulator {
  count: number;
  negative: number;
  escalated: number;
  sample: string;
  lastSeen: Date;
}

function buildComplaints(
  inWeek: readonly ReportTicket[],
  previousWeek: readonly ReportTicket[],
): ComplaintEntry[] {
  const current = new Map<string, ComplaintAccumulator>();
  for (const ticket of inWeek) {
    const intent = ticket.intent || "general_inquiry";
    const negative = NEGATIVE.has(ticket.sentiment) ? 1 : 0;
    const escalated = ticket.actionStatus === "escalated" ? 1 : 0;
    const existing = current.get(intent);
    if (existing === undefined) {
      current.set(intent, {
        count: 1,
        negative,
        escalated,
        sample: ticket.customerQuery.slice(0, 140),
        lastSeen: ticket.createdAt,
      });
      continue;
    }
    existing.count += 1;
    existing.negative += negative;
    existing.escalated += escalated;
    if (ticket.createdAt > existing.lastSeen) {
      existing.lastSeen = ticket.createdAt;
      existing.sample = ticket.customerQuery.slice(0, 140);
    }
  }

  const previousCounts = new Map<string, number>();
  for (const ticket of previousWeek) {
    const intent = ticket.intent || "general_inquiry";
    previousCounts.set(intent, (previousCounts.get(intent) ?? 0) + 1);
  }

  return [...current.entries()]
    .map(([intent, stats]) => {
      const previousCount = previousCounts.get(intent) ?? 0;
      const delta = stats.count - previousCount;
      return {
        intent,
        count: stats.count,
        negative: stats.negative,
        negativeShare: Math.round((stats.negative / stats.count) * 100),
        previousCount,
        delta,
        direction: directionFor(previousCount, delta),
        sample: stats.sample,
        lastSeen: stats.lastSeen.toISOString(),
        escalated: stats.escalated,
      } satisfies ComplaintEntry & { escalated: number };
    })
    .filter((entry) => entry.count >= 2 && (entry.negative >= 1 || entry.escalated >= 1))
    .sort(
      (a, b) =>
        b.negative - a.negative || b.count - a.count || a.intent.localeCompare(b.intent),
    )
    .slice(0, MAX_COMPLAINTS)
    .map(({ escalated: _escalated, ...entry }) => entry);
}

function directionFor(
  previousCount: number,
  delta: number,
): ComplaintEntry["direction"] {
  if (previousCount === 0) return "new";
  if (delta > 0) return "rising";
  if (delta < 0) return "cooling";
  return "steady";
}

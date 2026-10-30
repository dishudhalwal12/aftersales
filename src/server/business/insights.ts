/**
 * Weekly sentiment + recurring-complaint aggregation (PRD §6, Phase 3).
 * Pure: takes rows in, returns the report out.
 */

export interface InsightTicket {
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

export interface RecurringComplaint {
  intent: string;
  count: number;
  negative: number;
  negativeShare: number;
  unbounded: boolean;
  sample: string;
  lastSeen: string;
}

export interface BusinessInsights {
  windowDays: number;
  from: string;
  to: string;
  totalTickets: number;
  autoAnswered: number;
  drafts: number;
  escalated: number;
  failed: number;
  escalationRate: number;
  autoAnswerRate: number;
  sentiment: {
    positive: number;
    neutral: number;
    frustrated: number;
    distressed: number;
  };
  busiestChannel: string | null;
  topRule: string | null;
  citations: number;
  recurringComplaints: RecurringComplaint[];
}

const NEGATIVE = new Set(["frustrated", "distressed"]);

export function buildInsights(
  tickets: readonly InsightTicket[],
  now: Date = new Date(),
  windowDays = 7,
): BusinessInsights {
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const inWindow = tickets.filter((ticket) => ticket.createdAt >= from);

  const sentiment = { positive: 0, neutral: 0, frustrated: 0, distressed: 0 };
  const channels = new Map<string, number>();
  const rules = new Map<string, number>();
  const intents = new Map<
    string,
    { count: number; negative: number; sample: string; lastSeen: Date }
  >();

  let autoAnswered = 0;
  let drafts = 0;
  let escalated = 0;
  let failed = 0;
  let citations = 0;

  for (const ticket of inWindow) {
    if (ticket.sentiment in sentiment) {
      sentiment[ticket.sentiment as keyof typeof sentiment] += 1;
    }
    channels.set(ticket.channel, (channels.get(ticket.channel) ?? 0) + 1);
    rules.set(ticket.routingRuleHit, (rules.get(ticket.routingRuleHit) ?? 0) + 1);

    if (ticket.actionStatus === "answered") autoAnswered += 1;
    else if (ticket.actionStatus === "draft") drafts += 1;
    else if (ticket.actionStatus === "escalated") escalated += 1;
    else failed += 1;

    if (ticket.citedChunkIds !== "" && ticket.citedChunkIds !== "[]") citations += 1;

    const key = ticket.intent || "general_inquiry";
    const existing = intents.get(key);
    const isNegative = NEGATIVE.has(ticket.sentiment);
    if (!existing) {
      intents.set(key, {
        count: 1,
        negative: isNegative ? 1 : 0,
        sample: ticket.customerQuery.slice(0, 140),
        lastSeen: ticket.createdAt,
      });
    } else {
      existing.count += 1;
      if (isNegative) existing.negative += 1;
      if (ticket.createdAt > existing.lastSeen) {
        existing.lastSeen = ticket.createdAt;
        existing.sample = ticket.customerQuery.slice(0, 140);
      }
    }
  }

  const recurringComplaints: RecurringComplaint[] = [...intents.entries()]
    .map(([intent, stats]) => ({
      intent,
      count: stats.count,
      negative: stats.negative,
      negativeShare: stats.count === 0 ? 0 : Math.round((stats.negative / stats.count) * 100),
      unbounded: false,
      sample: stats.sample,
      lastSeen: stats.lastSeen.toISOString(),
    }))
    .filter((entry) => entry.count >= 2)
    .sort(
      (a, b) =>
        b.negative - a.negative || b.count - a.count || a.intent.localeCompare(b.intent),
    )
    .slice(0, 6);

  const total = inWindow.length;
  const percent = (part: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

  return {
    windowDays,
    from: from.toISOString(),
    to: now.toISOString(),
    totalTickets: total,
    autoAnswered,
    drafts,
    escalated,
    failed,
    escalationRate: percent(escalated),
    autoAnswerRate: percent(autoAnswered),
    sentiment,
    busiestChannel: topKey(channels),
    topRule: topKey(rules),
    citations,
    recurringComplaints,
  };
}

function topKey(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

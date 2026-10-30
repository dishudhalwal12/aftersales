import { redirect } from "next/navigation";
import { prisma } from "../../server/db.ts";
import { getCurrentUser } from "../../server/auth/session.ts";
import { resolveProvider } from "../../server/ai/orchestrator.ts";
import { buildInsights, type InsightTicket } from "../../server/business/insights.ts";
import { sarvamStatus } from "../../server/voice/sarvam.ts";
import { signOutAction } from "../auth/actions.ts";
import { DashboardShell, type TabKey } from "../../components/dashboard/DashboardShell.tsx";
import { OverviewBoard, type OverviewData } from "../../components/dashboard/OverviewBoard.tsx";
import { LiveQueuePanel } from "../../components/dashboard/LiveQueuePanel.tsx";
import { VoiceTestPanel } from "../../components/dashboard/VoiceTestPanel.tsx";
import { BrainInsightsPanel } from "../../components/dashboard/BrainInsightsPanel.tsx";
import { ChannelsPanel } from "../../components/dashboard/ChannelsPanel.tsx";
import type { BusinessSummary } from "../../shared/api.ts";
import { resetDemoAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const TABS: ReadonlySet<string> = new Set(["overview", "queue", "voice", "brain", "channels"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function humanizeIntent(intent: string): string {
  const text = intent.replace(/[_-]+/g, " ").trim();
  if (text === "") return "General inquiry";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const rows = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      businessType: true,
      brainVersion: true,
      autoSendEnabled: true,
      _count: { select: { chunks: true, tickets: true } },
    },
  });

  if (rows.length === 0) redirect("/onboarding");

  const businesses: BusinessSummary[] = rows.map((row) => ({
    businessId: row.id,
    name: row.name,
    businessType: row.businessType,
    brainVersion: row.brainVersion,
    autoSendEnabled: row.autoSendEnabled,
    chunkCount: row._count.chunks,
    ticketCount: row._count.tickets,
  }));

  const params = await searchParams;
  const requestedBusiness = typeof params["business"] === "string" ? params["business"] : "";
  const activeBusiness =
    businesses.find((business) => business.businessId === requestedBusiness) ?? businesses[0];

  if (!activeBusiness) redirect("/onboarding");

  const requestedTab = typeof params["tab"] === "string" ? params["tab"] : "overview";
  const tab = (TABS.has(requestedTab) ? requestedTab : "overview") as TabKey;
  const requestedState = typeof params["state"] === "string" ? params["state"] : "";
  const searchQuery = typeof params["q"] === "string" ? params["q"] : "";

  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const [queueCount, stateRows, ticketRows] = await Promise.all([
    prisma.ticket.count({
      where: { businessId: activeBusiness.businessId, state: { not: "closed" } },
    }),
    prisma.ticket.groupBy({
      by: ["state"],
      where: { businessId: activeBusiness.businessId },
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      where: { businessId: activeBusiness.businessId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const insightRows: InsightTicket[] = ticketRows.map((ticket) => ({
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

  const insights = buildInsights(insightRows, now, 7);

  // Half-day activity buckets for the last thirteen days, oldest first.
  const dots: boolean[] = [];
  for (let index = 25; index >= 0; index -= 1) {
    const end = new Date(now.getTime() - index * (DAY_MS / 2));
    const start = new Date(end.getTime() - DAY_MS / 2);
    dots.push(
      ticketRows.some((ticket) => ticket.createdAt >= start && ticket.createdAt < end),
    );
  }

  // Tickets per day for the last seven days, oldest first.
  const weekBars = Array.from({ length: 7 }, (_, index) => {
    const dayStart = new Date(now.getTime() - (6 - index) * DAY_MS);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    return ticketRows.filter(
      (ticket) => ticket.createdAt >= dayStart && ticket.createdAt < dayEnd,
    ).length;
  });

  // Positive-sentiment share per day, carried forward when a day is quiet.
  const spark: number[] = [];
  let lastShare = 50;
  for (let index = 6; index >= 0; index -= 1) {
    const dayStart = new Date(now.getTime() - index * DAY_MS);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const dayTickets = ticketRows.filter(
      (ticket) => ticket.createdAt >= dayStart && ticket.createdAt < dayEnd,
    );
    if (dayTickets.length > 0) {
      lastShare = Math.round(
        (dayTickets.filter((ticket) => ticket.sentiment === "positive").length /
          dayTickets.length) *
          100,
      );
    }
    spark.push(lastShare);
  }

  const intentCounts = new Map<string, number>();
  for (const ticket of ticketRows) {
    const key = ticket.intent === "" ? "general_inquiry" : ticket.intent;
    intentCounts.set(key, (intentCounts.get(key) ?? 0) + 1);
  }
  const intents = [...intentCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([intent, count]) => ({ label: humanizeIntent(intent), count }));

  const tally = new Map(stateRows.map((row) => [row.state, row._count._all]));
  const counts = {
    open: queueCount,
    total: insights.totalTickets,
    answered: insights.autoAnswered,
    escalated: insights.escalated,
    draft: insights.drafts,
    closed: tally.get("closed") ?? 0,
  };

  const overview: OverviewData = {
    business: {
      businessId: activeBusiness.businessId,
      name: activeBusiness.name,
      type: activeBusiness.businessType,
      brainVersion: activeBusiness.brainVersion,
      chunkCount: activeBusiness.chunkCount,
    },
    counts,
    insights: {
      windowDays: insights.windowDays,
      autoAnswered: insights.autoAnswered,
      drafts: insights.drafts,
      escalated: insights.escalated,
      autoAnswerRate: insights.autoAnswerRate,
      escalationRate: insights.escalationRate,
      citations: insights.citations,
      totalTickets: insights.totalTickets,
      topRule: insights.topRule,
      busiestChannel: insights.busiestChannel,
      sentiment: insights.sentiment,
    },
    dots,
    weekBars,
    spark,
    intents,
  };

  const provider = resolveProvider({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });
  const degraded = provider === "heuristic";
  const providerLabel = degraded
    ? "offline retrieval classifier — no model key configured"
    : `openrouter · ${process.env.LLM_MODEL_ID ?? "default model"}`;

  const voice = sarvamStatus();
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(now);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(now);

  return (
    <DashboardShell
      businesses={businesses}
      activeBusiness={activeBusiness}
      tab={tab}
      user={{ name: user.name, email: user.email }}
      providerLabel={providerLabel}
      degraded={degraded}
      queueCount={queueCount}
      today={{ day: String(now.getDate()), weekday, month }}
      resetAction={resetDemoAction}
      signOutAction={signOutAction}
    >
      {tab === "overview" && <OverviewBoard data={overview} />}
      {tab === "queue" && (
        <LiveQueuePanel
          businessId={activeBusiness.businessId}
          initialQuery={searchQuery}
          initialState={requestedState}
        />
      )}
      {tab === "voice" && (
        <VoiceTestPanel
          businessId={activeBusiness.businessId}
          businessName={activeBusiness.name}
          sarvamConfigured={voice.configured}
        />
      )}
      {tab === "brain" && <BrainInsightsPanel businessId={activeBusiness.businessId} />}
      {tab === "channels" && (
        <ChannelsPanel
          businessId={activeBusiness.businessId}
          sarvamConfigured={voice.configured}
          virtualNumber={voice.virtualNumber}
        />
      )}
    </DashboardShell>
  );
}

import { redirect } from "next/navigation";
import { prisma } from "../../server/db.ts";
import { getCurrentUser } from "../../server/auth/session.ts";
import { resolveProvider } from "../../server/ai/orchestrator.ts";
import { sarvamStatus } from "../../server/voice/sarvam.ts";
import { isBaileysConfigured } from "../../server/integrations/baileys.ts";
import { signOutAction } from "../auth/actions.ts";
import { DashboardShell, type TabKey } from "../../components/dashboard/DashboardShell.tsx";
import { LiveQueuePanel } from "../../components/dashboard/LiveQueuePanel.tsx";
import { VoiceTestPanel } from "../../components/dashboard/VoiceTestPanel.tsx";
import { BrainInsightsPanel } from "../../components/dashboard/BrainInsightsPanel.tsx";
import { ChannelsPanel } from "../../components/dashboard/ChannelsPanel.tsx";
import type { BusinessSummary, VoiceSessionView } from "../../shared/api.ts";
import { resetDemoAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const TABS: ReadonlySet<string> = new Set(["queue", "voice", "brain", "channels"]);

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

  const requestedTab = typeof params["tab"] === "string" ? params["tab"] : "queue";
  const tab = (TABS.has(requestedTab) ? requestedTab : "queue") as TabKey;

  const queueCount = await prisma.ticket.count({
    where: { businessId: activeBusiness.businessId, state: { not: "closed" } },
  });

  const provider = resolveProvider({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });
  const degraded = provider === "heuristic";
  const providerLabel = degraded
    ? "offline retrieval classifier — no model key configured"
    : `openrouter · ${process.env.LLM_MODEL_ID ?? "default model"}`;

  const voice = sarvamStatus();

  // The last call this business has, read from the database so the panel still shows the
  // transcript, duration and outcome after a reload (Phase 4 gate).
  const latestCall = await prisma.voiceTestSession.findFirst({
    where: {
      businessId: activeBusiness.businessId,
      // Only a call that actually ended is a "last call". A session that is still `initiated`
      // has no transcript, no outcome and no queue ticket — showing it here would claim a
      // completed call that never happened.
      status: { in: ["completed", "failed"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      demoPin: true,
      transcript: true,
      durationSeconds: true,
      escalationOutcome: true,
      createdAt: true,
    },
  });
  const lastSession: VoiceSessionView | null =
    latestCall === null
      ? null
      : {
          sessionId: latestCall.id,
          status: latestCall.status,
          demoPin: latestCall.demoPin,
          transcript: latestCall.transcript,
          durationSeconds: latestCall.durationSeconds,
          escalationOutcome: latestCall.escalationOutcome,
          createdAt: latestCall.createdAt.toISOString(),
        };

  return (
    <DashboardShell
      businesses={businesses}
      activeBusiness={activeBusiness}
      tab={tab}
      user={{ name: user.name, email: user.email }}
      providerLabel={providerLabel}
      degraded={degraded}
      queueCount={queueCount}
      resetAction={resetDemoAction}
      signOutAction={signOutAction}
    >
      {tab === "queue" && <LiveQueuePanel businessId={activeBusiness.businessId} />}
      {tab === "voice" && (
        <VoiceTestPanel
          businessId={activeBusiness.businessId}
          businessName={activeBusiness.name}
          sarvamConfigured={voice.configured}
          lastSession={lastSession}
        />
      )}
      {tab === "brain" && <BrainInsightsPanel businessId={activeBusiness.businessId} />}
      {tab === "channels" && (
        <ChannelsPanel
          businessId={activeBusiness.businessId}
          sarvamConfigured={voice.configured}
          virtualNumber={voice.virtualNumber}
          baileysConfigured={isBaileysConfigured()}
        />
      )}
    </DashboardShell>
  );
}

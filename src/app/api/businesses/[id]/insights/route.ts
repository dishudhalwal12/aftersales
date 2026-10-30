import { z } from "zod";

import { jsonOk, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { SENTIMENTS } from "@/lib/constants";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

type InsightTicket = {
  intent: string;
  sentiment: string;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: string;
  channel: string;
  customerQuery: string;
  createdAt: Date;
};

function share(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const business = await assertBusinessOwnership(user.id, id);

    const { days } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);

    const tickets = await prisma.ticket.findMany({
      where: { businessId: business.id, createdAt: { gte: windowStart } },
      select: {
        intent: true,
        sentiment: true,
        urgencyScore: true,
        confidenceScore: true,
        actionStatus: true,
        channel: true,
        customerQuery: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const total = tickets.length;

    const sentimentBreakdown = SENTIMENTS.map((sentiment) => {
      const count = tickets.filter((ticket) => ticket.sentiment === sentiment).length;
      return { sentiment, count, share: share(count, total) };
    }).sort((a, b) => b.count - a.count);

    const channelCounts = new Map<string, number>();
    for (const ticket of tickets) {
      channelCounts.set(ticket.channel, (channelCounts.get(ticket.channel) ?? 0) + 1);
    }
    const channelBreakdown = [...channelCounts.entries()]
      .map(([channel, count]) => ({ channel, count, share: share(count, total) }))
      .sort((a, b) => b.count - a.count);

    const intentGroups = new Map<string, InsightTicket[]>();
    for (const ticket of tickets) {
      const group = intentGroups.get(ticket.intent) ?? [];
      group.push(ticket);
      intentGroups.set(ticket.intent, group);
    }

    const recurringComplaints = [...intentGroups.entries()]
      .map(([intent, group]) => {
        const latest = group[group.length - 1];
        return {
          intent,
          count: group.length,
          share: share(group.length, total),
          recurring: group.length >= 2,
          escalatedCount: group.filter((ticket) => ticket.actionStatus === "escalated").length,
          avgUrgency: average(group.map((ticket) => ticket.urgencyScore)),
          avgConfidence: average(group.map((ticket) => ticket.confidenceScore)),
          lastSeenAt: latest.createdAt,
          sampleQuery: latest.customerQuery,
        };
      })
      .sort((a, b) => b.count - a.count || a.intent.localeCompare(b.intent))
      .slice(0, 10);

    const dailyTrend: Array<{ date: string; tickets: number; escalated: number }> = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(windowEnd.getTime() - offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const dayTickets = tickets.filter(
        (ticket) => ticket.createdAt.toISOString().slice(0, 10) === date
      );
      dailyTrend.push({
        date,
        tickets: dayTickets.length,
        escalated: dayTickets.filter((ticket) => ticket.actionStatus === "escalated").length,
      });
    }

    return jsonOk({
      businessId: business.id,
      windowDays: days,
      windowStart,
      windowEnd,
      generatedAt: new Date(),
      totals: {
        tickets: total,
        autoSent: tickets.filter((ticket) => ticket.actionStatus === "answered").length,
        drafts: tickets.filter((ticket) => ticket.actionStatus === "draft").length,
        escalated: tickets.filter((ticket) => ticket.actionStatus === "escalated").length,
        failed: tickets.filter((ticket) => ticket.actionStatus === "failed").length,
        avgConfidence: average(tickets.map((ticket) => ticket.confidenceScore)),
        avgUrgency: average(tickets.map((ticket) => ticket.urgencyScore)),
      },
      sentimentBreakdown,
      channelBreakdown,
      recurringComplaints,
      dailyTrend,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

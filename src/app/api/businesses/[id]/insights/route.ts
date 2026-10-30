import { NextResponse } from "next/server";
import { prisma } from "../../../../../server/db.ts";
import { buildInsights, type InsightTicket } from "../../../../../server/business/insights.ts";
import { errorResponse, loadOwnedBusiness, requireUser } from "../../../../../server/auth/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const WINDOW_DAYS = 7;
const LOOKBACK_DAYS = 30;

/** GET /api/businesses/[id]/insights — weekly sentiment + recurring complaints. */
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);

    const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
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

    const report = buildInsights(rows, new Date(), WINDOW_DAYS);
    return NextResponse.json({ businessId: business.id, ...report });
  } catch (error) {
    return errorResponse(error);
  }
}

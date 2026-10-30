import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db.ts";
import {
  applyTicketAction,
  isTicketState,
  type TicketAction,
} from "../../../../../lib/ticket-actions.ts";
import { errorResponse, loadOwnedBusiness, readJson, requireUser } from "../../../../../lib/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/businesses/[id]/tickets
 * List the queue, or one ticket with its append-only event trail.
 */
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);

    const url = new URL(request.url);
    const ticketId = url.searchParams.get("ticketId");

    if (ticketId) {
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, businessId: business.id },
        include: { events: { orderBy: { createdAt: "asc" } } },
      });
      if (!ticket) {
        return NextResponse.json(
          { error: { code: 404, message: "ticket not found" } },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ticket: { ...ticket, citedChunkIds: parseCited(ticket.citedChunkIds) },
        events: ticket.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          payload: safeParse(event.payload),
          createdAt: event.createdAt.toISOString(),
        })),
      });
    }

    const state = url.searchParams.get("state") ?? "all";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

    const tickets = await prisma.ticket.findMany({
      where: {
        businessId: business.id,
        ...(state !== "all" && isTicketState(state) ? { state } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      businessId: business.id,
      count: tickets.length,
      tickets: tickets.map((ticket) => ({
        ticketId: ticket.id,
        channel: ticket.channel,
        customerName: ticket.customerName,
        customerHandle: ticket.customerHandle,
        customerQuery: ticket.customerQuery,
        state: ticket.state,
        specialistAssigned: ticket.specialistAssigned,
        intent: ticket.intent,
        sentiment: ticket.sentiment,
        urgencyScore: ticket.urgencyScore,
        confidenceScore: ticket.confidenceScore,
        actionStatus: ticket.actionStatus,
        routingRuleHit: ticket.routingRuleHit,
        aiDraftOrReply: ticket.aiDraftOrReply,
        citedChunkIds: parseCited(ticket.citedChunkIds),
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/businesses/[id]/tickets
 * A human acting on a held ticket: approve a draft, resolve an escalation, close.
 * The agent itself can never take these paths — the state machine has no
 * `escalated -> replied` edge (F9).
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    const body = await readJson(request);

    const ticketId = body["ticketId"];
    const action = body["action"];
    if (typeof ticketId !== "string" || ticketId.length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: 'field "ticketId" is required' } },
        { status: 400 },
      );
    }

    const allowed: TicketAction[] = ["approve_draft", "resolve", "close"];
    if (typeof action !== "string" || !allowed.includes(action as TicketAction)) {
      return NextResponse.json(
        { error: { code: 400, message: 'field "action" must be approve_draft, resolve or close' } },
        { status: 400 },
      );
    }

    const result = await applyTicketAction(business.id, ticketId, action as TicketAction);
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.status, message: result.message } },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ticketId: result.ticket.id,
      state: result.ticket.state,
      actionStatus: result.ticket.actionStatus,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseCited(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

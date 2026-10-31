/**
 * Human actions on a held ticket. These are the only paths out of `escalated`
 * and out of `draft`, and they are always human-initiated.
 */

import type { Ticket } from "@prisma/client";
import { prisma } from "../db.ts";

export type TicketAction = "approve_draft" | "resolve" | "close";

export type TicketActionResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; status: number; message: string };

export async function applyTicketAction(
  businessId: string,
  ticketId: string,
  action: TicketAction,
): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, businessId } });
  if (!ticket) return { ok: false, status: 404, message: "ticket not found" };

  if (action === "approve_draft") {
    if (ticket.actionStatus !== "draft") {
      return {
        ok: false,
        status: 409,
        message: "only a held draft can be approved and sent",
      };
    }
    return commit(ticket, "replied", "answered", "HUMAN_APPROVED_SEND", {
      approvedBy: "business_owner",
    });
  }

  if (action === "resolve") {
    if (ticket.state !== "escalated") {
      return { ok: false, status: 409, message: "only an escalated ticket can be resolved" };
    }
    // `escalated` is left by a human, never by an automatic send.
    return commit(ticket, "closed", "escalated", "HUMAN_RESOLVED", {
      resolvedBy: "business_owner",
    });
  }

  if (ticket.state === "closed") {
    return { ok: false, status: 409, message: "ticket is already closed" };
  }
  return commit(ticket, "closed", ticket.actionStatus, "TICKET_CLOSED", {
    closedBy: "business_owner",
  });
}

async function commit(
  ticket: Ticket,
  state: string,
  actionStatus: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<TicketActionResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.ticket.update({
      where: { id: ticket.id },
      data: { state, actionStatus },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        eventType,
        payload: JSON.stringify({ ...payload, from: ticket.state, to: state }),
      },
    });
    return row;
  });
  return { ok: true, ticket: updated };
}

export const TICKET_STATES: ReadonlySet<string> = new Set([
  "new",
  "triaged",
  "replied",
  "escalated",
  "closed",
]);

export function isTicketState(value: string): value is string {
  return TICKET_STATES.has(value);
}

/**
 * The one place a Ticket row becomes the JSON the queue reads.
 *
 * The detail endpoint used to spread the Prisma row, which carries `id` and not
 * `ticketId`; the drawer then PATCHed `{ action }` with no id and the server
 * answered `field "ticketId" is required`. One mapper means list and detail can
 * never disagree about the shape again.
 */
function parseCited(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function toTicketSummary(ticket: {
  id: string;
  channel: string;
  customerName: string;
  customerHandle: string;
  customerQuery: string;
  state: string;
  specialistAssigned: string;
  intent: string;
  sentiment: string;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: string;
  routingRuleHit: string;
  aiDraftOrReply: string;
  citedChunkIds: string;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
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
  };
}

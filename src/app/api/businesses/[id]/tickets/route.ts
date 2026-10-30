import { z } from "zod";

import { ApiError, jsonOk, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { TICKET_STATES } from "@/lib/constants";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CHANNELS = ["TEXT_MODAL", "WHATSAPP", "INSTAGRAM", "GMAIL", "VOICE"] as const;

const querySchema = z.object({
  state: z.string().optional(),
  channel: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseList(
  value: string | undefined,
  allowed: readonly string[],
  field: string,
  normalize: (raw: string) => string
): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => normalize(item.trim()))
    .filter(Boolean);
  if (items.length === 0) return undefined;

  const invalid = items.filter((item) => !allowed.includes(item));
  if (invalid.length > 0) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Invalid ${field} value(s): ${invalid.join(", ")}. Allowed: ${allowed.join(", ")}.`
    );
  }
  return items;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const business = await assertBusinessOwnership(user.id, id);

    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));

    const states = parseList(query.state, TICKET_STATES, "state", (raw) => raw.toLowerCase());
    const channels = parseList(query.channel, CHANNELS, "channel", (raw) => raw.toUpperCase());

    const where = {
      businessId: business.id,
      ...(states ? { state: { in: states } } : {}),
      ...(channels ? { channel: { in: channels } } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
        include: {
          events: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return jsonOk({
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        businessId: ticket.businessId,
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
        citedChunkIds: parseJson(ticket.citedChunkIds) ?? [],
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        events: ticket.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          payload: parseJson(event.payload),
          createdAt: event.createdAt,
        })),
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

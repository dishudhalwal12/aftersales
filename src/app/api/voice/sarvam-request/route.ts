import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db.ts";
import { getCurrentUser } from "../../../../server/auth/session.ts";
import {
  authorizeVoiceContext,
  parseTrustedIdentifiers,
  resolveCallBusiness,
} from "../../../../server/voice/context.ts";
import {
  VOICE_REQUEST_TYPES,
  loadActiveCustomizations,
  requestDisposition,
  type VoiceRequestType,
} from "../../../../server/voice/customizations.ts";
import {
  HttpError,
  errorResponse,
  loadOwnedBusiness,
  readJson,
} from "../../../../server/auth/tenant.ts";
import type { VoiceRequestResponse } from "../../../../shared/api.ts";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

function optionalText(body: Record<string, unknown>, key: string, max: number): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `field "${key}" must be a string`);
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max) throw new HttpError(400, `field "${key}" exceeds ${max} characters`);
  return text;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * POST /api/voice/sarvam-request — the mid-call capture tool for appointment,
 * reschedule, cancellation and callback requests.
 *
 * This deployment has no calendar/booking integration, so the only honest
 * answer is "recorded, pending owner confirmation": `confirmed` is always the
 * literal `false` and the route never writes a booking state. A request becomes
 * a VOICE ticket in the owner's queue (R5 draft), or an escalated R1 ticket when
 * the caller describes an emergency.
 *
 * Trust mirrors `/api/voice/sarvam-context`: a shared secret plus trusted
 * agent/number (or session/PIN) for the voice platform, never a frontend-supplied
 * business id; an owner session may act on a business it owns.
 */
export async function POST(request: Request) {
  try {
    const auth = authorizeVoiceContext(request.headers);
    let ownerId: string | null = null;
    if (!auth.authorized) {
      const user = await getCurrentUser();
      if (user === null) throw new HttpError(401, "missing or invalid voice context token");
      ownerId = user.id;
    }

    const body = await readJson(request);
    const requestTypeRaw = typeof body["requestType"] === "string" ? body["requestType"].trim() : "";
    if (!(VOICE_REQUEST_TYPES as readonly string[]).includes(requestTypeRaw)) {
      throw new HttpError(400, `field "requestType" must be one of ${VOICE_REQUEST_TYPES.join(", ")}`);
    }
    const requestType = requestTypeRaw as VoiceRequestType;

    const customerName = optionalText(body, "customerName", 120) ?? "Voice caller";
    const customerPhone = optionalText(body, "customerPhone", 20);
    if (customerPhone !== null && !PHONE_RE.test(customerPhone)) {
      throw new HttpError(400, 'field "customerPhone" must be E.164, e.g. +919812345678');
    }
    const preferredDate = optionalText(body, "preferredDate", 10);
    if (preferredDate !== null && !isCalendarDate(preferredDate)) {
      throw new HttpError(400, 'field "preferredDate" must be YYYY-MM-DD');
    }
    const preferredTime = optionalText(body, "preferredTime", 5);
    if (preferredTime !== null && !TIME_RE.test(preferredTime)) {
      throw new HttpError(400, 'field "preferredTime" must be HH:MM');
    }
    const notes = optionalText(body, "notes", 1_000);
    const emergency = body["emergency"] === true;
    const externalRequestId = optionalText(body, "externalRequestId", 120);

    const { agentId, virtualNumber } = parseTrustedIdentifiers(body);
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"].trim() : "";
    const demoPin = typeof body["demoPin"] === "string" ? body["demoPin"].trim() : "";

    const ownerBusinessId = optionalText(body, "businessId", 100);
    let businessId: string;
    let resolvedBy: string;
    if (ownerId !== null && ownerBusinessId !== null) {
      const business = await loadOwnedBusiness(ownerId, ownerBusinessId);
      businessId = business.id;
      resolvedBy = "owner";
    } else {
      const resolution = await resolveCallBusiness({ agentId, virtualNumber, sessionId, demoPin });
      businessId = resolution.businessId;
      resolvedBy = resolution.resolvedBy;
    }

    const key =
      externalRequestId !== null
        ? `voice-request:${externalRequestId}`
        : sessionId.length > 0
          ? `voice-request:${sessionId}:${requestType}`
          : null;
    if (key === null) {
      throw new HttpError(
        400,
        "externalRequestId is required when the call cannot be identified by sessionId",
      );
    }

    const active = await loadActiveCustomizations(businessId);
    const disposition = requestDisposition({
      requestType,
      appointmentEnabled: active.appointmentBooking !== null,
      emergency,
    });

    const reply = (input: {
      requestId: string | null;
      duplicate: boolean;
      accepted: boolean;
      pending: boolean;
    }): VoiceRequestResponse => ({
      requestId: input.requestId,
      requestType,
      accepted: input.accepted,
      confirmed: false,
      pending: input.pending,
      duplicate: input.duplicate,
      intent: disposition.intent,
      routingRuleHit: disposition.rule,
      ticketState: disposition.state,
      actionStatus: disposition.actionStatus,
      message: disposition.message,
    });

    const existing = await prisma.ticket.findFirst({
      where: { businessId, externalMessageId: key },
      select: { id: true, state: true, actionStatus: true, routingRuleHit: true, intent: true },
    });
    if (existing) {
      return NextResponse.json({
        ...reply({ requestId: existing.id, duplicate: true, accepted: true, pending: disposition.pending }),
        intent: existing.intent ?? disposition.intent,
        routingRuleHit: existing.routingRuleHit ?? disposition.rule,
        ticketState: existing.state,
        actionStatus: existing.actionStatus,
        resolvedBy,
      });
    }

    if (!disposition.accepted) {
      return NextResponse.json({
        ...reply({ requestId: null, duplicate: false, accepted: false, pending: false }),
        resolvedBy,
      });
    }

    const detailParts = [
      `Voice ${requestType} request`,
      preferredDate !== null ? `date ${preferredDate}` : "",
      preferredTime !== null ? `time ${preferredTime}` : "",
      notes !== null ? `notes: ${notes}` : "",
    ].filter(Boolean);

    try {
      const ticket = await prisma.$transaction(async (tx) => {
        const row = await tx.ticket.create({
          data: {
            businessId,
            externalMessageId: key,
            channel: "VOICE",
            customerName,
            customerHandle: customerPhone ?? "voice caller",
            customerQuery: detailParts.join(" · ").slice(0, 500),
            state: disposition.state,
            specialistAssigned: "general",
            intent: disposition.intent,
            sentiment: emergency ? "frustrated" : "neutral",
            urgencyScore: disposition.urgency,
            confidenceScore: 0,
            actionStatus: disposition.actionStatus,
            routingRuleHit: disposition.rule,
            aiDraftOrReply: disposition.message,
            citedChunkIds: JSON.stringify([]),
          },
        });

        await tx.ticketEvent.createMany({
          data: [
            {
              ticketId: row.id,
              eventType: "INBOUND_RECEIVED",
              payload: JSON.stringify({
                channel: "VOICE",
                source: "sarvam_request_tool",
                requestType,
                resolvedBy,
                preferredDate,
                preferredTime,
                emergency,
              }),
            },
            {
              ticketId: row.id,
              eventType: "ROUTING_DECIDED",
              payload: JSON.stringify({
                rule: disposition.rule,
                actionStatus: disposition.actionStatus,
                intent: disposition.intent,
                confirmed: false,
                pending: disposition.pending,
              }),
            },
            {
              ticketId: row.id,
              eventType: disposition.actionStatus === "escalated" ? "ESCALATED" : "DRAFT_SAVED",
              payload: JSON.stringify({ requestType, confirmed: false }),
            },
          ],
        });

        return row;
      });

      return NextResponse.json({
        ...reply({ requestId: ticket.id, duplicate: false, accepted: true, pending: disposition.pending }),
        resolvedBy,
      });
    } catch (error) {
      // Two tool calls for the same request: the unique id picks the winner.
      if (isUniqueViolation(error)) {
        const raced = await prisma.ticket.findFirst({
          where: { businessId, externalMessageId: key },
          select: { id: true, state: true, actionStatus: true, routingRuleHit: true, intent: true },
        });
        if (raced) {
          return NextResponse.json({
            ...reply({ requestId: raced.id, duplicate: true, accepted: true, pending: disposition.pending }),
            intent: raced.intent ?? disposition.intent,
            routingRuleHit: raced.routingRuleHit ?? disposition.rule,
            ticketState: raced.state,
            actionStatus: raced.actionStatus,
            resolvedBy,
          });
        }
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

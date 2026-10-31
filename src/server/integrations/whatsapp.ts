// WhatsApp channel integration glue: connection ids per business, channel
// metadata stored in ChannelConnection.configJson, and the inbound pipeline
// that hands messages to the existing triage service and auto-replies through
// the local Baileys service.
//
// Tenant resolution rule: the business is always the owner of the channel row
// found by connectionId. No request body may choose a business for inbound or
// status traffic, and connect/disconnect/QR require the owner session.

import { randomBytes } from "node:crypto";

import type { ChannelConnection } from "@prisma/client";

import {
  channelAutoSendAllowed,
  respondToContact,
  type InboundContact,
  type RespondResult,
} from "../business/service.ts";
import { handoffReply } from "../business/handoff.ts";
import { prisma } from "../db.ts";
import {
  sendBaileysMessage,
  type BaileysConnectionSnapshot,
  type BaileysConnectionStatus,
} from "./baileys.ts";
import { isChannelStatus, readChannelConfig } from "./channels.ts";
import { IntegrationError } from "./errors.ts";

/** Inbound hand-off, injectable so tests can exercise the flow without the LLM. */
export type WhatsappRespond = (contact: InboundContact) => Promise<RespondResult>;

export const WHATSAPP_CONNECTION_ID_PREFIX = "wa_";
const WHATSAPP_CONNECTION_ID_PATTERN = /^wa_[A-Za-z0-9_-]{8,72}$/;

export function createWhatsappConnectionId(): string {
  return `${WHATSAPP_CONNECTION_ID_PREFIX}${randomBytes(16).toString("hex")}`;
}

export function isWhatsappConnectionId(value: unknown): value is string {
  return typeof value === "string" && WHATSAPP_CONNECTION_ID_PATTERN.test(value);
}

export function readWhatsappConnectionId(configJson: string | null): string | null {
  const value = readChannelConfig(configJson).whatsappConnectionId;
  return isWhatsappConnectionId(value) ? value : null;
}

// connectionId is globally unique because it is generated here; scanning the
// small whatsapp channel set keeps configJson opaque and needs no migration.
export async function findWhatsappChannelByConnectionId(
  connectionId: string
): Promise<ChannelConnection | null> {
  if (!isWhatsappConnectionId(connectionId)) return null;

  const candidates = await prisma.channelConnection.findMany({
    where: {
      channelType: "WHATSAPP",
      configJson: { contains: connectionId },
    },
  });

  return (
    candidates.find(
      (channel) => readWhatsappConnectionId(channel.configJson) === connectionId
    ) ?? null
  );
}

export type WhatsappChannelSnapshot = {
  connectionId: string;
  status: BaileysConnectionStatus;
  qrExpiresAt?: string | null;
  connectedAt?: string | null;
  phoneNumber?: string | null;
  lastError?: string | null;
};

// Mirrors the service state into configJson and flips the channel row to
// CONNECTED only on a real open event. Every other state keeps the original
// demo mode (TEST_MODE/DRAFT_ONLY) so auto-send rules do not change silently.
export async function saveWhatsappSnapshot(
  channel: ChannelConnection,
  snapshot: WhatsappChannelSnapshot
): Promise<ChannelConnection> {
  const current = readChannelConfig(channel.configJson);
  const patch: Record<string, unknown> = {
    whatsappConnectionId: snapshot.connectionId,
    whatsappStatus: snapshot.status,
    whatsappQrExpiresAt: snapshot.qrExpiresAt ?? null,
    whatsappConnectedAt: snapshot.connectedAt ?? null,
    whatsappPhoneNumber: snapshot.phoneNumber ?? null,
    whatsappLastError: snapshot.lastError ?? null,
  };

  let channelStatus = channel.status;
  if (snapshot.status === "connected") {
    if (channel.status !== "CONNECTED") {
      patch.whatsappPreviousStatus =
        isChannelStatus(channel.status) && channel.status !== "UNAVAILABLE"
          ? channel.status
          : "TEST_MODE";
    }
    channelStatus = "CONNECTED";
  } else if (channel.status === "CONNECTED") {
    const stored = current.whatsappPreviousStatus;
    patch.whatsappPreviousStatus = null;
    channelStatus =
      isChannelStatus(stored) && stored !== "CONNECTED" && stored !== "UNAVAILABLE"
        ? stored
        : "TEST_MODE";
  }

  const nextConfigJson = JSON.stringify({ ...current, ...patch });
  const currentConfigJson = channel.configJson ?? JSON.stringify(current);

  if (nextConfigJson === currentConfigJson && channelStatus === channel.status) {
    return channel;
  }

  return prisma.channelConnection.update({
    where: { id: channel.id },
    data: { configJson: nextConfigJson, status: channelStatus },
  });
}

export type WhatsappStatusEvent = {
  connectionId: string;
  businessId?: string | null;
  status: BaileysConnectionStatus;
  qrExpiresAt?: string | null;
  connectedAt?: string | null;
  phoneNumber?: string | null;
  lastError?: string | null;
};

export async function applyBaileysStatus(
  event: WhatsappStatusEvent
): Promise<ChannelConnection> {
  const channel = await findWhatsappChannelByConnectionId(event.connectionId);
  if (!channel) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
  }

  if (event.businessId && event.businessId !== channel.businessId) {
    // connectionId stays authoritative; a mismatch points at a broken service
    // record, which is worth seeing in logs but not enough to drop the update.
    console.warn("[whatsapp] status businessId does not match the stored connection", {
      connectionId: event.connectionId,
      reportedBusinessId: event.businessId,
    });
  }

  return saveWhatsappSnapshot(channel, {
    connectionId: event.connectionId,
    status: event.status,
    qrExpiresAt: event.qrExpiresAt ?? null,
    connectedAt: event.connectedAt ?? null,
    phoneNumber: event.phoneNumber ?? null,
    lastError: event.lastError ?? null,
  });
}

export function connectionResponse(
  channel: ChannelConnection,
  snapshot: BaileysConnectionSnapshot
) {
  return {
    businessId: channel.businessId,
    connectionId: snapshot.connectionId,
    status: snapshot.status,
    qr: snapshot.qr,
    qrExpiresAt: snapshot.qrExpiresAt,
    connectedAt: snapshot.connectedAt,
    phoneNumber: snapshot.phoneNumber,
    lastError: snapshot.lastError,
    channelStatus: channel.status,
  };
}

export type WhatsappOutbound = { text: string; handoff: boolean } | null;

/**
 * What may leave the linked device for one inbound message.
 *
 *   R6 (grounded)        → the generated answer.
 *   below the floor      → the fixed hand-off, never the model text.
 *   duplicate / disabled → nothing at all.
 *
 * Pure so the three-way decision is testable without a socket.
 */
export function chooseWhatsappOutbound(input: {
  duplicate: boolean;
  shouldAutoSend: boolean;
  answer: string;
  canSend: boolean;
  business: { name: string; escalationEmail: string; escalationPhone: string };
}): WhatsappOutbound {
  if (input.duplicate || !input.canSend) return null;
  // The model is instructed to write a polite hand-off when it cannot ground an
  // answer (confidence < 50). That text is what the owner wants delivered, so a
  // below-floor reply keeps its escalation for a human but is still sent.
  if (input.answer.trim().length > 0) {
    return { text: input.answer, handoff: !input.shouldAutoSend };
  }
  return { text: handoffReply(input.business), handoff: true };
}

export type WhatsappInboundMessage = {
  connectionId: string;
  messageId: string;
  sender: string;
  text: string;
};

export type WhatsappInboundOutcome = {
  duplicate: boolean;
  ticketId: string;
  businessId: string;
  routingRuleHit: string;
  actionStatus: string;
  replySent: boolean;
  replyError: string | null;
};

// Delivery truth belongs to the adapter that performed the send: the routing
// event says a send was approved, never that WhatsApp accepted it.
async function recordSendEvent(
  ticketId: string,
  eventType: "WHATSAPP_SENT" | "WHATSAPP_SEND_FAILED",
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.ticketEvent.create({
      data: { ticketId, eventType, payload: JSON.stringify(payload) },
    });
  } catch (error) {
    console.error("[whatsapp] could not record send outcome", {
      ticketId,
      eventType,
      error: error instanceof Error ? error.message : error,
    });
  }
}

type SendFn = (
  connectionId: string,
  businessId: string,
  recipient: string,
  message: string
) => Promise<{ messageId: string }>;

export type WhatsappDependencies = {
  respond?: WhatsappRespond;
  send?: SendFn;
};

export async function processWhatsappInbound(
  message: WhatsappInboundMessage,
  deps: WhatsappDependencies = {}
): Promise<WhatsappInboundOutcome> {
  const channel = await findWhatsappChannelByConnectionId(message.connectionId);
  if (!channel) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
  }

  const business = await prisma.business.findUnique({
    where: { id: channel.businessId },
  });
  if (!business) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
  }

  // Reuses the shared pipeline: tenant scoping, externalMessageId idempotency,
  // triage, and the R1-R7 decision that decides whether a reply may be sent.
  const outcome = await (deps.respond ?? respondToContact)({
    business,
    channel: "WHATSAPP",
    externalMessageId: message.messageId,
    customerName: message.sender,
    customerHandle: message.sender,
    query: message.text,
  });

  let replySent = false;
  let replyError: string | null = null;

  const send = deps.send ?? sendBaileysMessage;
  const canSend = !outcome.duplicate && (await channelAutoSendAllowed(business, "WHATSAPP"));

  // A grounded answer (R6) is sent as-is. Anything below the floor keeps its
  // escalation for a human, but the customer still gets a fixed hand-off built
  // from the business record — silence is not a support policy.
  const outbound = chooseWhatsappOutbound({
    duplicate: outcome.duplicate,
    shouldAutoSend: outcome.shouldAutoSend,
    answer: outcome.answer,
    canSend,
    business,
  });

  if (outbound !== null) {
    try {
      const delivered = await send(message.connectionId, business.id, message.sender, outbound.text);
      replySent = true;
      await recordSendEvent(outcome.ticketId, "WHATSAPP_SENT", {
        recipient: message.sender,
        messageId: delivered.messageId,
        text: outbound.text.slice(0, 280),
        ...(outbound.handoff ? { handoff: true } : {}),
      });
    } catch (error) {
      replyError = error instanceof IntegrationError ? error.reason : "WHATSAPP_SEND_FAILED";
      console.error("[whatsapp] auto-reply failed", {
        connectionId: message.connectionId,
        ticketId: outcome.ticketId,
        handoff: outbound.handoff,
        error: error instanceof Error ? error.message : error,
      });
      await recordSendEvent(outcome.ticketId, "WHATSAPP_SEND_FAILED", {
        recipient: message.sender,
        error: replyError,
        text: outbound.text.slice(0, 280),
        ...(outbound.handoff ? { handoff: true } : {}),
      });
    }
  }

  return {
    duplicate: outcome.duplicate,
    ticketId: outcome.ticketId,
    businessId: outcome.businessId,
    routingRuleHit: outcome.routingRuleHit,
    actionStatus: outcome.actionStatus,
    replySent,
    replyError,
  };
}

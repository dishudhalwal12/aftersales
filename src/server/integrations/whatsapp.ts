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

import { ApiError } from "./api";
import {
  sendBaileysMessage,
  type BaileysConnectionSnapshot,
  type BaileysConnectionStatus,
} from "./baileys";
import { handleInboundWebhook } from "./channel-webhook";
import { isChannelStatus, readChannelConfig } from "./channels";
import { prisma } from "./db";
import type { TriageDependencies } from "./triage";

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
    throw new ApiError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
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

type SendFn = (
  connectionId: string,
  businessId: string,
  recipient: string,
  message: string
) => Promise<{ messageId: string }>;

export type WhatsappDependencies = {
  llm?: TriageDependencies["llm"];
  send?: SendFn;
};

export async function processWhatsappInbound(
  message: WhatsappInboundMessage,
  deps: WhatsappDependencies = {}
): Promise<WhatsappInboundOutcome> {
  const channel = await findWhatsappChannelByConnectionId(message.connectionId);
  if (!channel) {
    throw new ApiError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
  }

  const business = await prisma.business.findUnique({
    where: { id: channel.businessId },
  });
  if (!business) {
    throw new ApiError(401, "UNAUTHORIZED", "Unknown WhatsApp connection.");
  }

  // Reuses the Phase 3 pipeline: tenant scoping, externalMessageId idempotency,
  // triage, and the R1-R7 decision that decides whether a reply may be sent.
  const outcome = await handleInboundWebhook(
    {
      business,
      provider: "WHATSAPP",
      externalMessageId: message.messageId,
      customerName: message.sender,
      customerHandle: message.sender,
      message: message.text,
    },
    { llm: deps.llm }
  );

  const result = outcome.result;
  let replySent = false;
  let replyError: string | null = null;

  if (!outcome.duplicate && result.shouldAutoSend && result.answer.trim()) {
    const send = deps.send ?? sendBaileysMessage;
    try {
      await send(message.connectionId, business.id, message.sender, result.answer);
      replySent = true;
    } catch (error) {
      replyError = error instanceof ApiError ? error.code : "WHATSAPP_SEND_FAILED";
      console.error("[whatsapp] auto-reply failed", {
        connectionId: message.connectionId,
        ticketId: result.ticketId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return {
    duplicate: outcome.duplicate,
    ticketId: result.ticketId,
    businessId: result.businessId,
    routingRuleHit: result.routingRuleHit,
    actionStatus: result.actionStatus,
    replySent,
    replyError,
  };
}

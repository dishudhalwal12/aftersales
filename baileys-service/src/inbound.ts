// Turns a raw Baileys message into the provider-neutral payload the Vercel
// backend expects. Only 1:1 text messages are forwarded; everything else is
// skipped safely.

import type { InboundMessage, RawWaMessage } from "./types";

// Keep in step with the backend's zod limit for inbound WhatsApp text.
const MAX_TEXT_LENGTH = 2000;

function toMillis(value: RawWaMessage["messageTimestamp"]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? toMillis(parsed) : null;
  }
  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return toMillis(value.toNumber());
  }
  return null;
}

function messageText(raw: RawWaMessage): string | null {
  const text =
    raw.message?.conversation ?? raw.message?.extendedTextMessage?.text ?? null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_TEXT_LENGTH
    ? `${trimmed.slice(0, MAX_TEXT_LENGTH - 1)}…`
    : trimmed;
}

export type InboundRecord = {
  connectionId: string;
  phoneNumber: string | null;
};

export type SkipReason =
  | "no-chat"
  | "fromMe"
  | "status-broadcast"
  | "group"
  | "broadcast"
  | "no-id"
  | "not-text";

/**
 * Why a raw Baileys message must not become a support ticket.
 *
 * Pure so the reason is testable and so the manager can log it: a silently
 * dropped message is indistinguishable from one that never arrived.
 */
export function skipReason(raw: RawWaMessage): SkipReason | null {
  const remoteJid = raw.key?.remoteJid;
  if (!remoteJid) return "no-chat";
  if (raw.key?.fromMe === true) return "fromMe";
  if (remoteJid === "status@broadcast") return "status-broadcast";
  if (remoteJid.endsWith("@g.us")) return "group";
  if (remoteJid.endsWith("@broadcast")) return "broadcast";
  if (!raw.key?.id) return "no-id";
  if (!messageText(raw)) return "not-text";
  return null;
}

// Returns null for anything that must not become a support ticket: the
// service's own outgoing messages, status/broadcast events, group chats and
// non-text messages (images, stickers, reactions, ...).
export function extractInboundMessage(
  record: InboundRecord,
  raw: RawWaMessage
): InboundMessage | null {
  if (skipReason(raw) !== null) return null;

  const remoteJid = raw.key?.remoteJid as string;
  const alt = raw.key?.remoteJidAlt;
  // WhatsApp may address an account by LID; when it also sends the phone JID,
  // that is the address a reply can actually reach.
  const sender =
    remoteJid.endsWith("@lid") && typeof alt === "string" && alt.endsWith("@s.whatsapp.net")
      ? alt
      : remoteJid;
  const messageId = raw.key?.id as string;
  const text = messageText(raw) as string;

  return {
    connectionId: record.connectionId,
    messageId,
    sender,
    recipient: record.phoneNumber ?? "",
    text,
    messageType: "text",
    timestamp: toMillis(raw.messageTimestamp) ?? Date.now(),
    direction: "inbound",
  };
}

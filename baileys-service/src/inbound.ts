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

// Returns null for anything that must not become a support ticket: the
// service's own outgoing messages, status/broadcast events, group chats and
// non-text messages (images, stickers, reactions, ...).
export function extractInboundMessage(
  record: InboundRecord,
  raw: RawWaMessage
): InboundMessage | null {
  const remoteJid = raw.key?.remoteJid;
  if (!remoteJid || raw.key?.fromMe === true) return null;
  if (remoteJid === "status@broadcast") return null;
  if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) return null;

  const messageId = raw.key?.id;
  if (!messageId) return null;

  const text = messageText(raw);
  if (!text) return null;

  return {
    connectionId: record.connectionId,
    messageId,
    sender: remoteJid,
    recipient: record.phoneNumber ?? "",
    text,
    messageType: "text",
    timestamp: toMillis(raw.messageTimestamp) ?? Date.now(),
    direction: "inbound",
  };
}

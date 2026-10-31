import { describe, expect, it } from "vitest";

import { DedupeCache } from "../src/dedupe";
import { extractInboundMessage, skipReason } from "../src/inbound";
import type { RawWaMessage } from "../src/types";

const record = {
  connectionId: "wa_connection_01",
  phoneNumber: "919812345678",
};

function message(overrides: Partial<RawWaMessage> = {}): RawWaMessage {
  return {
    key: {
      id: "WAMID_1",
      remoteJid: "919700000001@s.whatsapp.net",
      fromMe: false,
    },
    message: { conversation: "What is the Pro Plan price?" },
    messageTimestamp: 1_730_000_000,
    ...overrides,
  };
}

describe("extractInboundMessage", () => {
  it("builds a provider-neutral payload for a text message", () => {
    const result = extractInboundMessage(record, message());
    expect(result).toEqual({
      connectionId: "wa_connection_01",
      messageId: "WAMID_1",
      sender: "919700000001@s.whatsapp.net",
      recipient: "919812345678",
      text: "What is the Pro Plan price?",
      messageType: "text",
      timestamp: 1_730_000_000_000,
      direction: "inbound",
    });
  });

  it("accepts extended text messages and trims the body", () => {
    const result = extractInboundMessage(
      record,
      message({ message: { extendedTextMessage: { text: "  hello  " } } })
    );
    expect(result?.text).toBe("hello");
  });

  it("ignores the service's own outgoing messages", () => {
    expect(extractInboundMessage(record, message({ key: { id: "x", remoteJid: "a", fromMe: true } }))).toBeNull();
  });

  it("ignores status broadcasts, groups and non-text messages", () => {
    const jid = (remoteJid: string) => message({ key: { id: "x", remoteJid, fromMe: false } });
    expect(extractInboundMessage(record, jid("status@broadcast"))).toBeNull();
    expect(extractInboundMessage(record, jid("1203630@g.us"))).toBeNull();
    expect(extractInboundMessage(record, message({ message: { imageMessage: {} } }))).toBeNull();
    expect(extractInboundMessage(record, message({ message: {} }))).toBeNull();
  });

  it("rejects messages without an id or sender", () => {
    expect(extractInboundMessage(record, message({ key: { id: null } }))).toBeNull();
    expect(extractInboundMessage(record, message({ key: { id: "x", remoteJid: null } }))).toBeNull();
  });

  it("supports Long-like timestamps and caps very long text", () => {
    const longText = "a".repeat(2500);
    const result = extractInboundMessage(
      record,
      message({
        message: { conversation: longText },
        messageTimestamp: { toNumber: () => 1_730_000_001 },
      })
    );
    expect(result?.timestamp).toBe(1_730_000_001_000);
    expect(result?.text.length).toBe(2000);
    expect(result?.text.endsWith("…")).toBe(true);
  });
});

describe("DedupeCache", () => {
  it("detects repeats and stays bounded", () => {
    const cache = new DedupeCache(3);
    expect(cache.add("a")).toBe(true);
    expect(cache.add("a")).toBe(false);
    cache.add("b");
    cache.add("c");
    cache.add("d");
    expect(cache.size).toBe(3);
    // "a" was evicted, so seeing it again counts as new.
    expect(cache.add("a")).toBe(true);
  });
});

  it("answers the phone JID when WhatsApp addresses the sender by LID", () => {
    const result = extractInboundMessage(record, message({
      key: {
        id: "WAMID_LID",
        remoteJid: "30425883926709@lid",
        remoteJidAlt: "919700000001@s.whatsapp.net",
        fromMe: false,
      },
    }));
    expect(result?.sender).toBe("919700000001@s.whatsapp.net");
  });

  it("keeps a LID when no phone JID came with it", () => {
    const result = extractInboundMessage(record, message({
      key: { id: "WAMID_LID2", remoteJid: "30425883926709@lid", fromMe: false },
    }));
    expect(result?.sender).toBe("30425883926709@lid");
  });

describe("skipReason", () => {
  it("returns null when the message is a forwardable inbound text", () => {
    expect(skipReason(message())).toBeNull();
  });

  it("names the service's own outgoing messages", () => {
    expect(skipReason(message({ key: { id: "WAMID_2", remoteJid: "919700000001@s.whatsapp.net", fromMe: true } }))).toBe("fromMe");
  });

  it("names group and broadcast chats", () => {
    expect(skipReason(message({ key: { id: "WAMID_3", remoteJid: "120363000000000000@g.us", fromMe: false } }))).toBe("group");
    expect(skipReason(message({ key: { id: "WAMID_4", remoteJid: "123@broadcast", fromMe: false } }))).toBe("broadcast");
  });

  it("names status updates", () => {
    expect(skipReason(message({ key: { id: "WAMID_5", remoteJid: "status@broadcast", fromMe: false } }))).toBe("status-broadcast");
  });

  it("names non-text messages and messages without a usable id", () => {
    expect(skipReason(message({ message: { imageMessage: {} } }))).toBe("not-text");
    expect(skipReason(message({ key: { id: undefined, remoteJid: "919700000001@s.whatsapp.net", fromMe: false } }))).toBe("no-id");
  });
});

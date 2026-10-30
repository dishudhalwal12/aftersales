import type { ChannelConnection } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApiError } from "@/lib/api";
import {
  BAILEYS_SECRET_HEADER,
  assertBaileysSecret,
  disconnectBaileysConnection,
  getBaileysConnection,
  sendBaileysMessage,
  startBaileysConnection,
  type FetchLike,
} from "@/lib/baileys";
import { prisma } from "@/lib/db";
import type { generateTriageResponse } from "@/lib/llm-orchestrator";
import type { LLMResponse } from "@/lib/routing-engine";
import {
  applyBaileysStatus,
  createWhatsappConnectionId,
  findWhatsappChannelByConnectionId,
  isWhatsappConnectionId,
  processWhatsappInbound,
  readWhatsappConnectionId,
} from "@/lib/whatsapp";

import {
  createTestBusiness,
  resetBusinessData,
} from "./helpers";

const WA_BIZ_A = "test_wa_biz_a";
const WA_BIZ_B = "test_wa_biz_b";
const WA_CONN_A = "wa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WA_CONN_B = "wa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const WA_CHUNK_A = "chk_wa_a";
const WA_CHUNK_B = "chk_wa_b";
const OWNER_A_EMAIL = "wa-owner-a@sphinx.demo";
const OWNER_B_EMAIL = "wa-owner-b@sphinx.demo";
const SECRET_VALUE = "unit-test-baileys-secret";

type LLMFn = typeof generateTriageResponse;

function fakeLlm(result: LLMResponse): LLMFn {
  return async () => result;
}

function groundedLlm(): LLMFn {
  return fakeLlm({
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 92,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: [WA_CHUNK_A, WA_CHUNK_B],
    reply_text: "The Pro Plan costs ₹1,499 per month.",
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Captured = { url: string; init?: RequestInit };

function recordingFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
): { calls: Captured[]; impl: FetchLike } {
  const calls: Captured[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, impl };
}

function headersOf(init?: RequestInit): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

async function channelOf(businessId: string): Promise<ChannelConnection> {
  return prisma.channelConnection.findUniqueOrThrow({
    where: { businessId_channelType: { businessId, channelType: "WHATSAPP" } },
  });
}

async function resetWhatsappChannels(): Promise<void> {
  await prisma.channelConnection.update({
    where: { businessId_channelType: { businessId: WA_BIZ_A, channelType: "WHATSAPP" } },
    data: {
      status: "CONNECTED",
      autoSend: true,
      configJson: JSON.stringify({
        whatsappConnectionId: WA_CONN_A,
        whatsappStatus: "connected",
      }),
    },
  });
  await prisma.channelConnection.update({
    where: { businessId_channelType: { businessId: WA_BIZ_B, channelType: "WHATSAPP" } },
    data: {
      status: "CONNECTED",
      autoSend: true,
      configJson: JSON.stringify({
        whatsappConnectionId: WA_CONN_B,
        whatsappStatus: "connected",
      }),
    },
  });
}

beforeAll(async () => {
  await resetBusinessData([WA_BIZ_A, WA_BIZ_B]);

  await createTestBusiness({
    id: WA_BIZ_A,
    ownerEmail: OWNER_A_EMAIL,
    name: "WhatsApp Test SaaS",
  });
  await createTestBusiness({
    id: WA_BIZ_B,
    ownerEmail: OWNER_B_EMAIL,
    name: "WhatsApp Test Clinic",
  });

  await prisma.knowledgeChunk.createMany({
    data: [
      {
        id: WA_CHUNK_A,
        businessId: WA_BIZ_A,
        chunkIndex: 1,
        section: "Products & Pricing",
        content: "The Pro Plan costs ₹1,499 per month for up to five users.",
        keywords: "pro,plan,pricing",
      },
      {
        id: WA_CHUNK_B,
        businessId: WA_BIZ_B,
        chunkIndex: 1,
        section: "Products & Pricing",
        content: "Root Canal Treatment costs ₹4,500 per tooth.",
        keywords: "root,canal,treatment",
      },
    ],
  });

  await prisma.channelConnection.createMany({
    data: [
      { businessId: WA_BIZ_A, channelType: "WHATSAPP", status: "CONNECTED", autoSend: true },
      { businessId: WA_BIZ_B, channelType: "WHATSAPP", status: "CONNECTED", autoSend: true },
    ],
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [WA_BIZ_A, WA_BIZ_B] } } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: { in: [WA_BIZ_A, WA_BIZ_B] } },
  });
  await resetWhatsappChannels();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await resetBusinessData([WA_BIZ_A, WA_BIZ_B]);
  await prisma.user.deleteMany({
    where: { email: { in: [OWNER_A_EMAIL, OWNER_B_EMAIL] } },
  });
});

describe("connection ids", () => {
  it("mints unique, prefixed ids that the local service accepts", () => {
    const first = createWhatsappConnectionId();
    const second = createWhatsappConnectionId();

    expect(first).toMatch(/^wa_[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
    expect(isWhatsappConnectionId(first)).toBe(true);
  });

  it("only reads ids that were generated locally", () => {
    expect(
      readWhatsappConnectionId(JSON.stringify({ whatsappConnectionId: WA_CONN_A }))
    ).toBe(WA_CONN_A);
    expect(
      readWhatsappConnectionId(JSON.stringify({ whatsappConnectionId: "conn_12345678" }))
    ).toBeNull();
    expect(
      readWhatsappConnectionId(JSON.stringify({ whatsappConnectionId: "../etc/passwd" }))
    ).toBeNull();
    expect(readWhatsappConnectionId("{not-json")).toBeNull();
    expect(readWhatsappConnectionId(null)).toBeNull();
  });

  it("never resolves an arbitrary or malformed connection id to a tenant", async () => {
    await expect(findWhatsappChannelByConnectionId("conn_12345678")).resolves.toBeNull();
    await expect(
      findWhatsappChannelByConnectionId("wa_cccccccccccccccccccccccccccccccc")
    ).resolves.toBeNull();
  });

  it("maps each connection to the owning business only", async () => {
    const channelA = await findWhatsappChannelByConnectionId(WA_CONN_A);
    const channelB = await findWhatsappChannelByConnectionId(WA_CONN_B);

    expect(channelA?.businessId).toBe(WA_BIZ_A);
    expect(channelB?.businessId).toBe(WA_BIZ_B);
  });
});

describe("processWhatsappInbound", () => {
  it("triages the message for the owning tenant and sends the reply through the same connection", async () => {
    const send = vi.fn(async () => ({ messageId: "out_1" }));

    const outcome = await processWhatsappInbound(
      {
        connectionId: WA_CONN_A,
        messageId: "wamid.a1",
        sender: "919811111111@s.whatsapp.net",
        text: "What does the Pro Plan cost?",
      },
      { llm: groundedLlm(), send }
    );

    expect(outcome).toEqual({
      duplicate: false,
      ticketId: expect.any(String),
      businessId: WA_BIZ_A,
      routingRuleHit: "R6",
      actionStatus: "answered",
      replySent: true,
      replyError: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      WA_CONN_A,
      WA_BIZ_A,
      "919811111111@s.whatsapp.net",
      "The Pro Plan costs ₹1,499 per month."
    );

    const ticket = await prisma.ticket.findUnique({
      where: { externalMessageId: "wamid.a1" },
    });
    expect(ticket?.businessId).toBe(WA_BIZ_A);
    expect(ticket?.channel).toBe("WHATSAPP");
    expect(ticket?.customerHandle).toBe("919811111111@s.whatsapp.net");
    expect(ticket?.customerQuery).toBe("What does the Pro Plan cost?");
  });

  it("never answers a duplicate WhatsApp message id twice", async () => {
    const send = vi.fn(async () => ({ messageId: "out_1" }));
    const message = {
      connectionId: WA_CONN_A,
      messageId: "wamid.dupe",
      sender: "919811111111@s.whatsapp.net",
      text: "What does the Pro Plan cost?",
    };

    const first = await processWhatsappInbound(message, { llm: groundedLlm(), send });
    const second = await processWhatsappInbound(message, { llm: groundedLlm(), send });

    expect(first.duplicate).toBe(false);
    expect(first.replySent).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.ticketId).toBe(first.ticketId);
    expect(second.replySent).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      prisma.ticket.count({ where: { externalMessageId: "wamid.dupe" } })
    ).resolves.toBe(1);
  });

  it("keeps each business's WhatsApp traffic isolated", async () => {
    const sendA = vi.fn(async () => ({ messageId: "out_a" }));
    const sendB = vi.fn(async () => ({ messageId: "out_b" }));

    await processWhatsappInbound(
      {
        connectionId: WA_CONN_A,
        messageId: "wamid.a2",
        sender: "919811111111@s.whatsapp.net",
        text: "What does the Pro Plan cost?",
      },
      { llm: groundedLlm(), send: sendA }
    );
    await processWhatsappInbound(
      {
        connectionId: WA_CONN_B,
        messageId: "wamid.b2",
        sender: "919822222222@s.whatsapp.net",
        text: "What does the Pro Plan cost?",
      },
      { llm: groundedLlm(), send: sendB }
    );

    expect(sendA).toHaveBeenCalledWith(
      WA_CONN_A,
      WA_BIZ_A,
      "919811111111@s.whatsapp.net",
      expect.any(String)
    );
    expect(sendB).toHaveBeenCalledWith(
      WA_CONN_B,
      WA_BIZ_B,
      "919822222222@s.whatsapp.net",
      expect.any(String)
    );

    const tickets = await prisma.ticket.findMany({
      where: { externalMessageId: { in: ["wamid.a2", "wamid.b2"] } },
    });
    expect(tickets.map((ticket) => [ticket.externalMessageId, ticket.businessId])).toEqual(
      expect.arrayContaining([
        ["wamid.a2", WA_BIZ_A],
        ["wamid.b2", WA_BIZ_B],
      ])
    );

    // Same message text, different tenant: each citation stays inside its own
    // knowledge base.
    const ticketA = tickets.find((ticket) => ticket.externalMessageId === "wamid.a2");
    const ticketB = tickets.find((ticket) => ticket.externalMessageId === "wamid.b2");
    expect(JSON.parse(ticketA?.citedChunkIds ?? "[]")).toEqual([WA_CHUNK_A]);
    expect(JSON.parse(ticketB?.citedChunkIds ?? "[]")).toEqual([WA_CHUNK_B]);
  });

  it("records the ticket but does not send when the channel only drafts", async () => {
    await prisma.channelConnection.update({
      where: { businessId_channelType: { businessId: WA_BIZ_A, channelType: "WHATSAPP" } },
      data: { autoSend: false },
    });
    const send = vi.fn(async () => ({ messageId: "out_1" }));

    const outcome = await processWhatsappInbound(
      {
        connectionId: WA_CONN_A,
        messageId: "wamid.draft",
        sender: "919811111111@s.whatsapp.net",
        text: "What does the Pro Plan cost?",
      },
      { llm: groundedLlm(), send }
    );

    expect(outcome.actionStatus).toBe("draft");
    expect(outcome.routingRuleHit).toBe("R5");
    expect(outcome.replySent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    await expect(
      prisma.ticket.count({ where: { externalMessageId: "wamid.draft" } })
    ).resolves.toBe(1);
  });

  it("keeps the triage result when the WhatsApp send fails", async () => {
    const send = vi.fn(async () => {
      throw new ApiError(409, "CONNECTION_NOT_CONNECTED", "WhatsApp is not connected.");
    });

    const outcome = await processWhatsappInbound(
      {
        connectionId: WA_CONN_A,
        messageId: "wamid.sendfail",
        sender: "919811111111@s.whatsapp.net",
        text: "What does the Pro Plan cost?",
      },
      { llm: groundedLlm(), send }
    );

    expect(outcome.actionStatus).toBe("answered");
    expect(outcome.replySent).toBe(false);
    expect(outcome.replyError).toBe("CONNECTION_NOT_CONNECTED");
    await expect(
      prisma.ticket.count({ where: { externalMessageId: "wamid.sendfail" } })
    ).resolves.toBe(1);
  });

  it("rejects messages from an unknown connection", async () => {
    await expect(
      processWhatsappInbound({
        connectionId: "wa_cccccccccccccccccccccccccccccccc",
        messageId: "wamid.unknown",
        sender: "919811111111@s.whatsapp.net",
        text: "Hello?",
      })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });
});

describe("applyBaileysStatus", () => {
  it("marks the channel CONNECTED on a real open event and remembers the previous mode", async () => {
    await prisma.channelConnection.update({
      where: { businessId_channelType: { businessId: WA_BIZ_A, channelType: "WHATSAPP" } },
      data: { status: "TEST_MODE", configJson: JSON.stringify({ whatsappConnectionId: WA_CONN_A }) },
    });

    const channel = await applyBaileysStatus({
      connectionId: WA_CONN_A,
      businessId: WA_BIZ_A,
      status: "connected",
      phoneNumber: "919812345678",
    });

    expect(channel.status).toBe("CONNECTED");
    const config = JSON.parse(channel.configJson ?? "{}");
    expect(config.whatsappStatus).toBe("connected");
    expect(config.whatsappPhoneNumber).toBe("919812345678");
    expect(config.whatsappPreviousStatus).toBe("TEST_MODE");
  });

  it("restores the demo mode when WhatsApp disconnects or logs out", async () => {
    await prisma.channelConnection.update({
      where: { businessId_channelType: { businessId: WA_BIZ_A, channelType: "WHATSAPP" } },
      data: { status: "TEST_MODE", configJson: JSON.stringify({ whatsappConnectionId: WA_CONN_A }) },
    });
    await applyBaileysStatus({
      connectionId: WA_CONN_A,
      status: "connected",
      phoneNumber: "919812345678",
    });

    const channel = await applyBaileysStatus({
      connectionId: WA_CONN_A,
      status: "logged_out",
      lastError: "WhatsApp logged this device out.",
    });

    expect(channel.status).toBe("TEST_MODE");
    const config = JSON.parse(channel.configJson ?? "{}");
    expect(config.whatsappStatus).toBe("logged_out");
    expect(config.whatsappPreviousStatus).toBeNull();
    expect(config.whatsappPhoneNumber).toBeNull();
  });

  it("rejects status events for unknown connections", async () => {
    await expect(
      applyBaileysStatus({
        connectionId: "wa_dddddddddddddddddddddddddddddddd",
        status: "connected",
      })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("never lets a mismatched businessId move another tenant's channel", async () => {
    const beforeB = await channelOf(WA_BIZ_B);

    const channelA = await applyBaileysStatus({
      connectionId: WA_CONN_A,
      businessId: WA_BIZ_B,
      status: "connected",
      phoneNumber: "919812345678",
    });

    const afterB = await channelOf(WA_BIZ_B);
    expect(channelA.businessId).toBe(WA_BIZ_A);
    expect(afterB.configJson).toBe(beforeB.configJson);
    expect(afterB.status).toBe(beforeB.status);
  });
});

describe("Baileys service secret", () => {
  it("answers 503 when the service is not configured, and 401 on a bad secret", async () => {
    vi.stubEnv("BAILEYS_SERVICE_URL", "");
    vi.stubEnv("BAILEYS_SERVICE_SECRET", "");
    expect(() => assertBaileysSecret(SECRET_VALUE)).toThrowError(
      expect.objectContaining({ status: 503, code: "BAILEYS_NOT_CONFIGURED" })
    );

    vi.stubEnv("BAILEYS_SERVICE_URL", "http://127.0.0.1:3001");
    vi.stubEnv("BAILEYS_SERVICE_SECRET", SECRET_VALUE);
    expect(() => assertBaileysSecret(null)).toThrowError(
      expect.objectContaining({ status: 401 })
    );
    expect(() => assertBaileysSecret("wrong-secret")).toThrowError(
      expect.objectContaining({ status: 401, code: "UNAUTHORIZED" })
    );
    expect(() => assertBaileysSecret(SECRET_VALUE)).not.toThrow();
  });
});

describe("Baileys service client", () => {
  beforeEach(() => {
    vi.stubEnv("BAILEYS_SERVICE_URL", "http://127.0.0.1:3001/");
    vi.stubEnv("BAILEYS_SERVICE_SECRET", SECRET_VALUE);
    vi.stubEnv("BAILEYS_TIMEOUT_MS", "1500");
  });

  it("posts the connection request with the shared secret and parsed ids", async () => {
    const { calls, impl } = recordingFetch(() =>
      jsonResponse({
        connectionId: WA_CONN_A,
        businessId: WA_BIZ_A,
        status: "qr",
        qr: "data:image/png;base64,AAAA",
        qrExpiresAt: "2026-10-31T10:01:00.000Z",
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
      })
    );

    const snapshot = await startBaileysConnection(WA_CONN_A, WA_BIZ_A, impl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:3001/connect");
    expect(calls[0].init?.method).toBe("POST");
    expect(headersOf(calls[0].init)[BAILEYS_SECRET_HEADER]).toBe(SECRET_VALUE);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      connectionId: WA_CONN_A,
      businessId: WA_BIZ_A,
    });
    expect(snapshot.status).toBe("qr");
    expect(snapshot.qr).toContain("data:image/png");
  });

  it("only fetches the QR while the service reports a qr state", async () => {
    const qrState = recordingFetch((url) =>
      url.includes("/status/")
        ? jsonResponse({
            connectionId: WA_CONN_A,
            businessId: WA_BIZ_A,
            status: "qr",
            qrAvailable: true,
            connectedAt: null,
            phoneNumber: null,
            lastError: null,
          })
        : jsonResponse({
            connectionId: WA_CONN_A,
            status: "qr",
            qr: "data:image/png;base64,BBBB",
            qrExpiresAt: "2026-10-31T10:01:00.000Z",
            connectedAt: null,
          })
    );

    const qrSnapshot = await getBaileysConnection(WA_CONN_A, qrState.impl);
    expect(qrState.calls.map((call) => call.url)).toEqual([
      `http://127.0.0.1:3001/status/${WA_CONN_A}`,
      `http://127.0.0.1:3001/qr/${WA_CONN_A}`,
    ]);
    expect(qrSnapshot.qr).toContain("base64,BBBB");

    const connectedState = recordingFetch(() =>
      jsonResponse({
        connectionId: WA_CONN_A,
        businessId: WA_BIZ_A,
        status: "connected",
        qrAvailable: false,
        connectedAt: "2026-10-31T09:59:00.000Z",
        phoneNumber: "919812345678",
        lastError: null,
      })
    );
    const connectedSnapshot = await getBaileysConnection(WA_CONN_A, connectedState.impl);
    expect(connectedState.calls).toHaveLength(1);
    expect(connectedSnapshot.status).toBe("connected");
    expect(connectedSnapshot.phoneNumber).toBe("919812345678");
  });

  it("sends replies and logs out with the documented payloads", async () => {
    const send = recordingFetch(() => jsonResponse({ messageId: "out_42" }));
    const sent = await sendBaileysMessage(
      WA_CONN_A,
      WA_BIZ_A,
      "919811111111@s.whatsapp.net",
      "Hello from the AI agent",
      send.impl
    );
    expect(sent).toEqual({ messageId: "out_42" });
    expect(send.calls[0].url).toBe("http://127.0.0.1:3001/send");
    expect(JSON.parse(String(send.calls[0].init?.body))).toEqual({
      connectionId: WA_CONN_A,
      businessId: WA_BIZ_A,
      recipient: "919811111111@s.whatsapp.net",
      message: "Hello from the AI agent",
    });

    const disconnect = recordingFetch(() =>
      jsonResponse({
        connectionId: WA_CONN_A,
        businessId: WA_BIZ_A,
        status: "logged_out",
        qr: null,
        qrExpiresAt: null,
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
      })
    );
    await disconnectBaileysConnection(WA_CONN_A, WA_BIZ_A, { fetchImpl: disconnect.impl });
    expect(disconnect.calls[0].url).toBe(
      `http://127.0.0.1:3001/disconnect/${WA_CONN_A}`
    );
    expect(JSON.parse(String(disconnect.calls[0].init?.body))).toEqual({
      businessId: WA_BIZ_A,
      logout: true,
    });
  });

  it("maps unreachable and rejected services to backend errors", async () => {
    const unreachable: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(
      startBaileysConnection(WA_CONN_A, WA_BIZ_A, unreachable)
    ).rejects.toMatchObject({ status: 502, code: "BAILEYS_UNAVAILABLE" });

    const rejected = recordingFetch(() =>
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Invalid service secret." } }, 401)
    );
    await expect(
      startBaileysConnection(WA_CONN_A, WA_BIZ_A, rejected.impl)
    ).rejects.toMatchObject({ status: 502, code: "BAILEYS_AUTH_FAILED" });

    const forbidden = recordingFetch(() =>
      jsonResponse({ error: { code: "FORBIDDEN", message: "Not your connection." } }, 403)
    );
    await expect(
      sendBaileysMessage(WA_CONN_A, WA_BIZ_A, "919811111111", "hi", forbidden.impl)
    ).rejects.toMatchObject({ status: 502, code: "BAILEYS_AUTH_FAILED" });

    const conflict = recordingFetch(() =>
      jsonResponse(
        { error: { code: "CONNECTION_NOT_CONNECTED", message: "Not connected." } },
        409
      )
    );
    await expect(
      sendBaileysMessage(WA_CONN_A, WA_BIZ_A, "919811111111", "hi", conflict.impl)
    ).rejects.toMatchObject({ status: 409, code: "CONNECTION_NOT_CONNECTED" });
  });
});

import type { Business, ChannelConnection } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  disconnectBaileysConnection,
  getBaileysConnection,
  startBaileysConnection,
  type BaileysConnectionSnapshot,
} from "@/lib/baileys";
import { prisma } from "@/lib/db";
import { readWhatsappConnectionId } from "@/lib/whatsapp";

// The routes are session-guarded. Mocking the guard (instead of loading
// NextAuth through it) keeps this suite focused on route behaviour; the guard
// itself is covered by the rest of the app.
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_wa_route_owner",
    email: "wa-route-owner@sphinx.demo",
  })),
  assertBusinessOwnership: vi.fn(async (userId: string, businessId: string) => {
    const { prisma: db } = await import("@/lib/db");
    const { ApiError: RouteError } = await import("@/lib/api");
    const business = await db.business.findFirst({
      where: { id: businessId, ownerId: userId },
    });
    if (!business) {
      throw new RouteError(403, "FORBIDDEN", "You do not have access to this business.");
    }
    return business;
  }),
}));

vi.mock("@/lib/baileys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/baileys")>("@/lib/baileys");
  return {
    ...actual,
    startBaileysConnection: vi.fn(),
    getBaileysConnection: vi.fn(),
    disconnectBaileysConnection: vi.fn(),
  };
});

vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return {
    ...actual,
    processWhatsappInbound: vi.fn(),
  };
});

import { POST as connectRoute } from "@/app/api/channels/whatsapp/connect/route";
import { GET as connectionRoute } from "@/app/api/channels/whatsapp/connection/route";
import { POST as disconnectRoute } from "@/app/api/channels/whatsapp/disconnect/route";
import { POST as inboundRoute } from "@/app/api/channels/whatsapp/inbound/route";
import { POST as statusRoute } from "@/app/api/channels/whatsapp/status/route";
import { processWhatsappInbound } from "@/lib/whatsapp";

import { resetBusinessData } from "./helpers";

const OWNER_ID = "user_wa_route_owner";
const OWNER_EMAIL = "wa-route-owner@sphinx.demo";
const OTHER_OWNER_ID = "user_wa_route_other";
const OTHER_OWNER_EMAIL = "wa-route-other@sphinx.demo";
const BIZ_A = "test_wa_route_a";
const BIZ_B = "test_wa_route_b";
const CONN_A = "wa_11111111111111111111111111111111";
const SECRET = "route-test-baileys-secret";

let channelA: ChannelConnection;

function businessData(
  id: string,
  name: string,
  ownerId: string
): Omit<Business, "createdAt" | "updatedAt"> {
  return {
    id,
    ownerId,
    name,
    businessType: "SaaS",
    description: "Route test business.",
    productsServices: "Test product catalogue.",
    hours: "Monday to Friday, 9:00 AM to 5:00 PM IST.",
    returnPolicy: "Test refund policy.",
    faqs: "Q: Test? A: Yes.",
    escalationEmail: "test@example.com",
    escalationPhone: "+919000000000",
    agentTone: "Warm, concise, and helpful",
    autoSendEnabled: true,
    compiledBrainMd: "# Test Business Brain",
    brainVersion: 1,
  };
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function snapshot(connectionId: string, overrides: Partial<BaileysConnectionSnapshot> = {}) {
  return {
    connectionId,
    businessId: BIZ_A,
    status: "qr" as const,
    qr: "data:image/png;base64,ROUTE_QR",
    qrExpiresAt: "2026-10-31T10:01:00.000Z",
    connectedAt: null,
    phoneNumber: null,
    lastError: null,
    ...overrides,
  };
}

async function reloadChannelA(): Promise<ChannelConnection> {
  return prisma.channelConnection.findUniqueOrThrow({
    where: { businessId_channelType: { businessId: BIZ_A, channelType: "WHATSAPP" } },
  });
}

beforeAll(async () => {
  await resetBusinessData([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_OWNER_EMAIL] } } });
  await prisma.user.create({
    data: { id: OWNER_ID, email: OWNER_EMAIL, name: "Route Owner" },
  });
  await prisma.user.create({
    data: { id: OTHER_OWNER_ID, email: OTHER_OWNER_EMAIL, name: "Other Owner" },
  });

  await prisma.business.create({ data: businessData(BIZ_A, "Route Test SaaS", OWNER_ID) });
  await prisma.business.create({
    data: businessData(BIZ_B, "Route Test Clinic", OTHER_OWNER_ID),
  });
});

beforeEach(async () => {
  vi.mocked(startBaileysConnection).mockReset();
  vi.mocked(getBaileysConnection).mockReset();
  vi.mocked(disconnectBaileysConnection).mockReset();
  vi.mocked(processWhatsappInbound).mockReset();

  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [BIZ_A, BIZ_B] } } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: { in: [BIZ_A, BIZ_B] } },
  });

  channelA = await prisma.channelConnection.upsert({
    where: { businessId_channelType: { businessId: BIZ_A, channelType: "WHATSAPP" } },
    update: { status: "TEST_MODE", autoSend: true, configJson: null },
    create: {
      businessId: BIZ_A,
      channelType: "WHATSAPP",
      status: "TEST_MODE",
      autoSend: true,
    },
  });
  await prisma.channelConnection.upsert({
    where: { businessId_channelType: { businessId: BIZ_B, channelType: "WHATSAPP" } },
    update: { status: "TEST_MODE", autoSend: true, configJson: null },
    create: {
      businessId: BIZ_B,
      channelType: "WHATSAPP",
      status: "TEST_MODE",
      autoSend: true,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await resetBusinessData([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_OWNER_EMAIL] } } });
});

describe("POST /api/channels/whatsapp/connect", () => {
  it("mints a connection id, asks the service for a QR, and persists the snapshot", async () => {
    vi.mocked(startBaileysConnection).mockImplementation(async (connectionId, businessId) =>
      snapshot(connectionId, { businessId })
    );

    const response = await connectRoute(
      post("http://localhost/api/channels/whatsapp/connect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe("qr");
    expect(body.qr).toContain("base64,ROUTE_QR");
    expect(body.channelStatus).toBe("TEST_MODE");
    expect(startBaileysConnection).toHaveBeenCalledWith(body.connectionId, BIZ_A);

    const channel = await reloadChannelA();
    expect(readWhatsappConnectionId(channel.configJson)).toBe(body.connectionId);
    expect(channel.status).toBe("TEST_MODE");
    expect(JSON.parse(channel.configJson ?? "{}").whatsappStatus).toBe("qr");
  });

  it("reuses the stored connection id on retry", async () => {
    vi.mocked(startBaileysConnection).mockImplementation(async (connectionId, businessId) =>
      snapshot(connectionId, { businessId })
    );

    const first = await (
      await connectRoute(
        post("http://localhost/api/channels/whatsapp/connect", { businessId: BIZ_A })
      )
    ).json();
    const second = await (
      await connectRoute(
        post("http://localhost/api/channels/whatsapp/connect", { businessId: BIZ_A })
      )
    ).json();

    expect(second.connectionId).toBe(first.connectionId);
    expect(startBaileysConnection).toHaveBeenNthCalledWith(2, first.connectionId, BIZ_A);
  });

  it("refuses another tenant's business", async () => {
    const response = await connectRoute(
      post("http://localhost/api/channels/whatsapp/connect", { businessId: BIZ_B })
    );
    expect(response.status).toBe(403);
    expect(startBaileysConnection).not.toHaveBeenCalled();
  });

  it("refuses an unavailable channel and validates the body", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: { status: "UNAVAILABLE" },
    });
    const unavailable = await connectRoute(
      post("http://localhost/api/channels/whatsapp/connect", { businessId: BIZ_A })
    );
    expect(unavailable.status).toBe(409)

    const invalid = await connectRoute(
      post("http://localhost/api/channels/whatsapp/connect", {})
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/channels/whatsapp/connection", () => {
  it("returns 404 before the business has ever connected", async () => {
    const response = await connectionRoute(
      new Request(`http://localhost/api/channels/whatsapp/connection?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("WHATSAPP_NOT_CONNECTED");
  });

  it("returns the QR while the service is waiting for a scan", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: { configJson: JSON.stringify({ whatsappConnectionId: CONN_A }) },
    });
    vi.mocked(getBaileysConnection).mockResolvedValue(snapshot(CONN_A));

    const response = await connectionRoute(
      new Request(`http://localhost/api/channels/whatsapp/connection?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.qr).toContain("base64");
    expect(body.connectionId).toBe(CONN_A);
    expect(JSON.parse((await reloadChannelA()).configJson ?? "{}").whatsappStatus).toBe("qr");
  });

  it("asks the owner to reconnect when the service lost the connection", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: { configJson: JSON.stringify({ whatsappConnectionId: CONN_A }) },
    });
    vi.mocked(getBaileysConnection).mockRejectedValue(
      new ApiError(404, "CONNECTION_NOT_FOUND", "That WhatsApp connection does not exist.")
    );

    const response = await connectionRoute(
      new Request(`http://localhost/api/channels/whatsapp/connection?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WHATSAPP_RECONNECT_REQUIRED");
  });

  it("requires businessId and tenant ownership", async () => {
    const missing = await connectionRoute(
      new Request("http://localhost/api/channels/whatsapp/connection")
    );
    expect(missing.status).toBe(400);

    const forbidden = await connectionRoute(
      new Request(`http://localhost/api/channels/whatsapp/connection?businessId=${BIZ_B}`)
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("POST /api/channels/whatsapp/disconnect", () => {
  it("logs out by default and restores the previous channel mode", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: {
        status: "CONNECTED",
        configJson: JSON.stringify({
          whatsappConnectionId: CONN_A,
          whatsappStatus: "connected",
          whatsappPreviousStatus: "TEST_MODE",
        }),
      },
    });
    vi.mocked(disconnectBaileysConnection).mockResolvedValue(
      snapshot(CONN_A, { status: "logged_out", qr: null, qrExpiresAt: null })
    );

    const response = await disconnectRoute(
      post("http://localhost/api/channels/whatsapp/disconnect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(200);
    expect(disconnectBaileysConnection).toHaveBeenCalledWith(CONN_A, BIZ_A, { logout: true });

    const channel = await reloadChannelA();
    expect(channel.status).toBe("TEST_MODE");
    expect(JSON.parse(channel.configJson ?? "{}").whatsappStatus).toBe("logged_out");
  });

  it("still succeeds locally when the service no longer knows the connection", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: { configJson: JSON.stringify({ whatsappConnectionId: CONN_A }) },
    });
    vi.mocked(disconnectBaileysConnection).mockRejectedValue(
      new ApiError(404, "CONNECTION_NOT_FOUND", "That WhatsApp connection does not exist.")
    );

    const response = await disconnectRoute(
      post("http://localhost/api/channels/whatsapp/disconnect", {
        businessId: BIZ_A,
        logout: false,
      })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("disconnected");
  });

  it("returns 404 when there is no connection to close", async () => {
    const response = await disconnectRoute(
      post("http://localhost/api/channels/whatsapp/disconnect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("WHATSAPP_NOT_CONNECTED");
  });
});

describe("POST /api/channels/whatsapp/inbound", () => {
  const payload = {
    connectionId: CONN_A,
    messageId: "wamid.route.1",
    sender: "919811111111@s.whatsapp.net",
    recipient: "919700000000@s.whatsapp.net",
    text: "What does the Pro Plan cost?",
    messageType: "text",
    timestamp: 1761897600000,
    direction: "inbound",
  };

  function inboundRequest(body: unknown, secret: string | null = SECRET): Request {
    return post(
      "http://localhost/api/channels/whatsapp/inbound",
      body,
      secret === null ? {} : { "x-baileys-secret": secret }
    );
  }

  beforeEach(() => {
    vi.stubEnv("BAILEYS_SERVICE_URL", "http://127.0.0.1:3001");
    vi.stubEnv("BAILEYS_SERVICE_SECRET", SECRET);
  });

  it("rejects missing or wrong service secrets", async () => {
    const missing = await inboundRoute(inboundRequest(payload, null));
    expect(missing.status).toBe(401);
    const wrong = await inboundRoute(inboundRequest(payload, "not-the-secret"));
    expect(wrong.status).toBe(401);
    expect(processWhatsappInbound).not.toHaveBeenCalled();
  });

  it("validates the payload before doing any work", async () => {
    const response = await inboundRoute(inboundRequest({ ...payload, text: "   " }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(processWhatsappInbound).not.toHaveBeenCalled();
  });

  it("passes the message to the tenant-aware handler and returns its outcome", async () => {
    vi.mocked(processWhatsappInbound).mockResolvedValue({
      duplicate: false,
      ticketId: "tkt_route_1",
      businessId: BIZ_A,
      routingRuleHit: "R6",
      actionStatus: "answered",
      replySent: true,
      replyError: null,
    });

    const response = await inboundRoute(inboundRequest(payload));
    expect(response.status).toBe(200);
    expect(processWhatsappInbound).toHaveBeenCalledWith({
      connectionId: CONN_A,
      messageId: "wamid.route.1",
      sender: "919811111111@s.whatsapp.net",
      text: "What does the Pro Plan cost?",
    });
    expect(await response.json()).toEqual({
      duplicate: false,
      ticketId: "tkt_route_1",
      businessId: BIZ_A,
      routingRuleHit: "R6",
      actionStatus: "answered",
      replySent: true,
      replyError: null,
    });
  });

  it("answers 503 when the deployment has no service secret configured", async () => {
    vi.stubEnv("BAILEYS_SERVICE_SECRET", "");
    const response = await inboundRoute(inboundRequest(payload));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("BAILEYS_NOT_CONFIGURED");
  });
});

describe("POST /api/channels/whatsapp/status", () => {
  function statusRequest(body: unknown, secret = SECRET): Request {
    return post("http://localhost/api/channels/whatsapp/status", body, {
      "x-baileys-secret": secret,
    });
  }

  beforeEach(() => {
    vi.stubEnv("BAILEYS_SERVICE_URL", "http://127.0.0.1:3001");
    vi.stubEnv("BAILEYS_SERVICE_SECRET", SECRET);
  });

  it("marks the owning channel connected and stores the phone number", async () => {
    await prisma.channelConnection.update({
      where: { id: channelA.id },
      data: { configJson: JSON.stringify({ whatsappConnectionId: CONN_A }) },
    });

    const response = await statusRoute(
      statusRequest({
        connectionId: CONN_A,
        businessId: BIZ_A,
        status: "connected",
        phoneNumber: "919812345678",
        lastError: null,
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.channelStatus).toBe("CONNECTED");

    const channel = await reloadChannelA();
    expect(channel.status).toBe("CONNECTED");
    const config = JSON.parse(channel.configJson ?? "{}");
    expect(config.whatsappStatus).toBe("connected");
    expect(config.whatsappPhoneNumber).toBe("919812345678");
  });

  it("rejects unknown connections, bad secrets, and invalid statuses", async () => {
    const unknown = await statusRoute(
      statusRequest({
        connectionId: "wa_22222222222222222222222222222222",
        status: "connected",
      })
    );
    expect(unknown.status).toBe(401);

    const unauthorized = await statusRoute(
      statusRequest({ connectionId: CONN_A, status: "connected" }, "wrong")
    );
    expect(unauthorized.status).toBe(401);

    const invalid = await statusRoute(
      statusRequest({ connectionId: CONN_A, status: "sleeping" })
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

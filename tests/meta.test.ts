import { createHmac } from "node:crypto";

import type { ChannelConnection } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/integration-crypto";
import type { generateTriageResponse } from "@/lib/llm-orchestrator";
import {
  META_SCOPES,
  buildMetaAuthorizationUrl,
  completeMetaAuthorization,
  disconnectMeta,
  exchangeMetaCode,
  fetchMetaPages,
  getMetaAssetsForBusiness,
  getMetaStatus,
  processMetaWebhook,
  readMetaConnection,
  readMetaPending,
  selectMetaAsset,
  sendMetaMessage,
  storeMetaPendingSelection,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
  type FetchedMetaPage,
  type MetaFetch,
} from "@/lib/meta";
import type { LLMResponse } from "@/lib/routing-engine";

import { createTestBusiness, resetBusinessData } from "./helpers";

const META_BIZ = "test_meta_biz";
const META_OWNER_EMAIL = "meta-owner@sphinx.demo";
const CHUNK_ID = "chk_meta_pricing";
const PAGE_ID = "page_100";
const IG_ID = "ig_200";
const PAGE_TOKEN = "page-token-secret";
const APP_SECRET = "test-meta-app-secret";

type LLMFn = typeof generateTriageResponse;

function groundedLlm(): { llm: LLMFn; calls: () => number } {
  let calls = 0;
  const llm: LLMFn = async () => {
    calls += 1;
    const result: LLMResponse = {
      specialist: "sales",
      intent: "pricing_inquiry",
      sentiment: "neutral",
      urgency_score: 20,
      confidence_score: 92,
      explicit_human_request: false,
      requires_human_judgment: false,
      cited_chunk_ids: [CHUNK_ID],
      reply_text: "The Pro Plan costs ₹1,499 per month.",
    };
    return result;
  };
  return { llm, calls: () => calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Captured = { url: string; init?: RequestInit };

function recorder(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): {
  fetchImpl: MetaFetch;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
  };
}

function fetchedPages(): FetchedMetaPage[] {
  return [
    {
      id: PAGE_ID,
      name: "Test Page",
      accessToken: PAGE_TOKEN,
      instagram: { id: IG_ID, username: "test.brand", name: "Test Brand" },
    },
  ];
}

async function ownerId(): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: META_BIZ } });
  return business.ownerId;
}

function storedMeta(kind: "page" | "instagram") {
  return {
    kind,
    assetId: kind === "page" ? PAGE_ID : IG_ID,
    pageId: PAGE_ID,
    pageName: "Test Page",
    igId: kind === "instagram" ? IG_ID : null,
    igUsername: kind === "instagram" ? "test.brand" : null,
    token: encryptSecret(PAGE_TOKEN),
    scopes: [...META_SCOPES],
    graphVersion: "v26.0",
    connectedAt: new Date().toISOString(),
    previousStatus: "UNAVAILABLE",
    previousAutoSend: false,
  };
}

async function seedMetaChannel(
  channelType: "FACEBOOK" | "INSTAGRAM",
  options: { status?: string; autoSend?: boolean; connection?: ReturnType<typeof storedMeta> | null; extraConfig?: Record<string, unknown> } = {}
): Promise<ChannelConnection> {
  await prisma.channelConnection.deleteMany({
    where: { businessId: META_BIZ, channelType },
  });
  const config = {
    metaConnection: options.connection === null ? null : (options.connection ?? storedMeta(channelType === "FACEBOOK" ? "page" : "instagram")),
    ...(options.extraConfig ?? {}),
  };
  return prisma.channelConnection.create({
    data: {
      businessId: META_BIZ,
      channelType,
      status: options.status ?? "CONNECTED",
      autoSend: options.autoSend ?? true,
      configJson: JSON.stringify(config),
    },
  });
}

beforeAll(async () => {
  await resetBusinessData([META_BIZ]);
  await createTestBusiness({
    id: META_BIZ,
    ownerEmail: META_OWNER_EMAIL,
    name: "Meta Test Business",
  });
  await prisma.knowledgeChunk.create({
    data: {
      id: CHUNK_ID,
      businessId: META_BIZ,
      chunkIndex: 0,
      section: "Pricing",
      content: "The Pro Plan costs ₹1,499 per month.",
      keywords: "pro plan pricing",
    },
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({ where: { ticket: { businessId: META_BIZ } } });
  await prisma.ticket.deleteMany({ where: { businessId: META_BIZ } });
  await prisma.channelConnection.deleteMany({ where: { businessId: META_BIZ } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await resetBusinessData([META_BIZ]);
});

describe("Meta OAuth", () => {
  it("builds a Facebook Login URL with only the messaging permissions", () => {
    const url = new URL(
      buildMetaAuthorizationUrl({
        redirectUri: "https://backend.test/api/social/meta/callback",
        state: "signed-state",
      })
    );
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v26.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("test-meta-app-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://backend.test/api/social/meta/callback"
    );
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe(META_SCOPES.join(","));
  });

  it("rejects OAuth when the app credentials are missing", () => {
    vi.stubEnv("META_APP_ID", "");
    expect(() =>
      buildMetaAuthorizationUrl({ redirectUri: "https://backend.test/cb", state: "state" })
    ).toThrowError(expect.objectContaining({ code: "META_NOT_CONFIGURED" }));
  });

  it("exchanges a code for a long-lived token", async () => {
    const { fetchImpl, calls } = recorder((url) => {
      if (url.includes("fb_exchange_token")) {
        return jsonResponse({ access_token: "long-lived-token", expires_in: 5_184_000 });
      }
      return jsonResponse({ access_token: "short-lived-token" });
    });

    const token = await exchangeMetaCode({
      code: "oauth-code",
      redirectUri: "https://backend.test/api/social/meta/callback",
      fetchImpl,
    });

    expect(token.accessToken).toBe("long-lived-token");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("code=oauth-code");
    expect(calls[1].url).toContain("grant_type=fb_exchange_token");
    expect(calls[1].url).toContain("fb_exchange_token=short-lived-token");
  });

  it("refuses to fall back to a short-lived token", async () => {
    const { fetchImpl } = recorder((url) =>
      url.includes("fb_exchange_token")
        ? jsonResponse({ error: { message: "exchange rejected" } }, 400)
        : jsonResponse({ access_token: "short-lived-token" })
    );

    await expect(
      exchangeMetaCode({
        code: "code",
        redirectUri: "https://backend.test/cb",
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: "META_TOKEN_EXCHANGE_FAILED" });
  });

  it("lists Pages with their linked Instagram professional account", async () => {
    const { fetchImpl, calls } = recorder(() =>
      jsonResponse({
        data: [
          {
            id: PAGE_ID,
            name: "Test Page",
            access_token: PAGE_TOKEN,
            instagram_business_account: { id: IG_ID, username: "test.brand", name: "Test Brand" },
          },
          { id: "page_without_token", name: "No token" },
        ],
      })
    );

    const pages = await fetchMetaPages("user-token", fetchImpl);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: PAGE_ID,
      name: "Test Page",
      accessToken: PAGE_TOKEN,
      instagram: { id: IG_ID, username: "test.brand" },
    });
    expect(String(calls[0].init?.headers && (calls[0].init?.headers as Record<string, string>).authorization)).toBe(
      "Bearer user-token"
    );
    expect(calls[0].url).toContain("instagram_business_account");
  });
});

describe("Meta asset selection", () => {
  async function authorizePending(): Promise<void> {
    const userId = await ownerId();
    const { fetchImpl } = recorder((url) => {
      if (url.includes("fb_exchange_token")) return jsonResponse({ access_token: "long" });
      if (url.includes("oauth/access_token")) return jsonResponse({ access_token: "short" });
      if (url.includes("me/accounts")) {
        return jsonResponse({
          data: [
            {
              id: PAGE_ID,
              name: "Test Page",
              access_token: PAGE_TOKEN,
              instagram_business_account: {
                id: IG_ID,
                username: "test.brand",
                name: "Test Brand",
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });

    await completeMetaAuthorization({
      businessId: META_BIZ,
      userId,
      code: "code",
      redirectUri: "https://backend.test/api/social/meta/callback",
      fetchImpl,
    });
  }

  it("stores a short-lived encrypted selection without marking anything connected", async () => {
    await authorizePending();

    const channel = await prisma.channelConnection.findUniqueOrThrow({
      where: { businessId_channelType: { businessId: META_BIZ, channelType: "FACEBOOK" } },
    });
    expect(channel.status).toBe("UNAVAILABLE");
    expect(channel.configJson).not.toContain(PAGE_TOKEN);

    const pending = readMetaPending(channel.configJson);
    expect(pending?.pages).toHaveLength(1);
    expect(decryptSecret(pending!.pages[0].token)).toBe(PAGE_TOKEN);

    const assets = await getMetaAssetsForBusiness(META_BIZ, await ownerId());
    expect(assets.assets).toEqual([
      {
        kind: "page",
        id: PAGE_ID,
        name: "Test Page",
        username: null,
        pageId: PAGE_ID,
        pageName: "Test Page",
      },
      {
        kind: "instagram",
        id: IG_ID,
        name: "Test Brand",
        username: "test.brand",
        pageId: PAGE_ID,
        pageName: "Test Page",
      },
    ]);
    expect(JSON.stringify(assets)).not.toContain(PAGE_TOKEN);
  });

  it("rejects a selection belonging to another user", async () => {
    await authorizePending();
    await expect(getMetaAssetsForBusiness(META_BIZ, "someone_else")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      selectMetaAsset({
        businessId: META_BIZ,
        userId: "someone_else",
        kind: "page",
        assetId: PAGE_ID,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an expired selection", async () => {
    await prisma.channelConnection.create({
      data: {
        businessId: META_BIZ,
        channelType: "FACEBOOK",
        status: "UNAVAILABLE",
        autoSend: false,
        configJson: JSON.stringify({
          metaPending: {
            userId: await ownerId(),
            pages: [],
            createdAt: new Date(Date.now() - 3_600_000).toISOString(),
            expiresAt: new Date(Date.now() - 1_800_000).toISOString(),
          },
        }),
      },
    });

    await expect(getMetaAssetsForBusiness(META_BIZ, await ownerId())).rejects.toMatchObject({
      code: "META_SELECTION_EXPIRED",
    });
  });

  it("subscribes and connects a Facebook Page only after the backend confirms it", async () => {
    await authorizePending();
    const { fetchImpl, calls } = recorder(() => jsonResponse({ success: true }));

    const result = await selectMetaAsset({
      businessId: META_BIZ,
      userId: await ownerId(),
      kind: "page",
      assetId: PAGE_ID,
      fetchImpl,
    });

    expect(result.provider).toBe("FACEBOOK");
    expect(result.summary).toMatchObject({
      connected: true,
      status: "connected",
      kind: "page",
      pageId: PAGE_ID,
      pageName: "Test Page",
    });
    expect(result.channel.status).toBe("CONNECTED");
    expect(result.channel.autoSend).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/${PAGE_ID}/subscribed_apps`);
    expect(calls[0].url).toContain("subscribed_fields=messages%2Cmessaging_postbacks");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${PAGE_TOKEN}`
    );

    const stored = readMetaConnection(result.channel.configJson);
    expect(stored?.token.startsWith("v1.")).toBe(true);
    expect(decryptSecret(stored!.token)).toBe(PAGE_TOKEN);
    expect(readMetaPending(result.channel.configJson)).toBeNull();
    expect(result.channel.configJson).not.toContain(PAGE_TOKEN);
  });

  it("connects a linked Instagram account through its Page token", async () => {
    await authorizePending();
    const { fetchImpl, calls } = recorder(() => jsonResponse({ success: true }));

    const result = await selectMetaAsset({
      businessId: META_BIZ,
      userId: await ownerId(),
      kind: "instagram",
      assetId: IG_ID,
      fetchImpl,
    });

    expect(result.provider).toBe("INSTAGRAM");
    expect(result.summary).toMatchObject({
      connected: true,
      kind: "instagram",
      pageId: PAGE_ID,
      igUsername: "test.brand",
    });
    // Instagram webhooks are app-level; subscribed_fields is not valid for them.
    expect(calls[0].url).not.toContain("subscribed_fields");

    const facebook = await prisma.channelConnection.findUniqueOrThrow({
      where: { businessId_channelType: { businessId: META_BIZ, channelType: "FACEBOOK" } },
    });
    expect(readMetaPending(facebook.configJson)).toBeNull();
  });

  it("rejects an asset that was never returned by Meta", async () => {
    await authorizePending();
    await expect(
      selectMetaAsset({
        businessId: META_BIZ,
        userId: await ownerId(),
        kind: "page",
        assetId: "page_not_in_selection",
      })
    ).rejects.toMatchObject({ code: "META_ASSET_NOT_AVAILABLE" });
  });

  it("does not mark a channel connected when the Page subscription fails", async () => {
    await authorizePending();
    const { fetchImpl } = recorder(() =>
      jsonResponse({ error: { message: "pages_manage_metadata missing" } }, 400)
    );

    await expect(
      selectMetaAsset({
        businessId: META_BIZ,
        userId: await ownerId(),
        kind: "instagram",
        assetId: IG_ID,
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: "META_SUBSCRIBE_FAILED" });

    const instagram = await prisma.channelConnection.findUnique({
      where: { businessId_channelType: { businessId: META_BIZ, channelType: "INSTAGRAM" } },
    });
    expect(instagram?.status ?? "UNAVAILABLE").toBe("UNAVAILABLE");
  });
});

describe("Meta webhooks", () => {
  it("verifies the challenge and rejects a wrong verify token", () => {
    expect(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "test-meta-verify-token",
        challenge: "challenge-123",
        expectedToken: "test-meta-verify-token",
      })
    ).toBe("challenge-123");

    expect(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "wrong",
        challenge: "challenge-123",
        expectedToken: "test-meta-verify-token",
      })
    ).toBeNull();
  });

  it("verifies the X-Hub-Signature-256 HMAC", () => {
    const raw = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
    expect(verifyMetaSignature(raw, signature, APP_SECRET)).toBe(true);
    expect(verifyMetaSignature(raw, signature, "other-secret")).toBe(false);
    expect(verifyMetaSignature(`${raw} `, signature, APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, null, APP_SECRET)).toBe(false);
  });

  it("processes Page messages, sends one reply, and ignores echoes and duplicates", async () => {
    await seedMetaChannel("FACEBOOK");
    const { llm, calls: llmCalls } = groundedLlm();
    const sends: Array<{ url: string; body: unknown }> = [];
    const { fetchImpl } = recorder((url, init) => {
      sends.push({ url, body: JSON.parse(String(init?.body)) });
      return jsonResponse({ message_id: "mid.sent" });
    });

    const payload = {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: Date.now(),
          messaging: [
            {
              sender: { id: "customer_psid" },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: { mid: "mid.inbound.1", text: "How much is the Pro Plan?" },
            },
            {
              sender: { id: PAGE_ID },
              recipient: { id: "customer_psid" },
              message: { mid: "mid.echo.1", text: "Our own reply", is_echo: true },
            },
          ],
        },
      ],
    };

    const first = await processMetaWebhook(payload, { llm, fetch: fetchImpl });
    expect(first).toMatchObject({
      received: 2,
      processed: 1,
      ignored: 1,
      duplicates: 0,
      repliesSent: 1,
    });
    expect(llmCalls()).toBe(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].url).toContain(`/v26.0/${PAGE_ID}/messages`);
    expect(sends[0].body).toMatchObject({
      recipient: { id: "customer_psid" },
      message: { text: "The Pro Plan costs ₹1,499 per month." },
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { externalMessageId: "meta:page:mid.inbound.1" },
    });
    expect(ticket).toMatchObject({
      businessId: META_BIZ,
      channel: "FACEBOOK",
      customerHandle: "customer_psid",
    });

    const second = await processMetaWebhook(payload, { llm, fetch: fetchImpl });
    expect(second.duplicates).toBe(1);
    expect(second.repliesSent).toBe(0);
    expect(sends).toHaveLength(1);
    expect(llmCalls()).toBe(1);
  });

  it("routes Instagram events to the Instagram channel and Page-messaging endpoint", async () => {
    await seedMetaChannel("INSTAGRAM");
    const { llm } = groundedLlm();
    const sends: Array<{ url: string; body: unknown }> = [];
    const { fetchImpl } = recorder((url, init) => {
      sends.push({ url, body: JSON.parse(String(init?.body)) });
      return jsonResponse({ message_id: "ig.sent" });
    });

    const summary = await processMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: IG_ID,
            messaging: [
              {
                sender: { id: "ig_customer" },
                recipient: { id: IG_ID },
                message: { mid: "ig.mid.1", text: "Do you have a Pro plan?" },
              },
            ],
          },
        ],
      },
      { llm, fetch: fetchImpl }
    );

    expect(summary).toMatchObject({ processed: 1, repliesSent: 1 });
    expect(sends[0].url).toContain(`/${PAGE_ID}/messages`);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { externalMessageId: "meta:instagram:ig.mid.1" },
    });
    expect(ticket.channel).toBe("INSTAGRAM");
  });

  it("ignores events for unconnected assets", async () => {
    const summary = await processMetaWebhook({
      object: "page",
      entry: [
        {
          id: "page_not_connected",
          messaging: [
            {
              sender: { id: "x" },
              recipient: { id: "page_not_connected" },
              message: { mid: "m", text: "hello" },
            },
          ],
        },
      ],
    });
    expect(summary).toMatchObject({ received: 0, processed: 0, ignored: 1 });
  });
});

describe("Meta sending, status, and disconnect", () => {
  it("sends with the stored Page token and clears it when Meta revokes the token", async () => {
    const channel = await seedMetaChannel("FACEBOOK");
    const ok = recorder((url, init) => {
      expect(url).toContain(`/v26.0/${PAGE_ID}/messages`);
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${PAGE_TOKEN}`);
      return jsonResponse({ message_id: "mid.sent.1" });
    });

    await expect(sendMetaMessage(channel, "customer_psid", "Hello", ok.fetchImpl)).resolves.toEqual({
      messageId: "mid.sent.1",
    });

    const revoked = recorder(() =>
      jsonResponse({ error: { code: 190, message: "Token expired" } }, 400)
    );
    await expect(
      sendMetaMessage(channel, "customer_psid", "Hello", revoked.fetchImpl)
    ).rejects.toMatchObject({ code: "META_RECONNECT_REQUIRED" });

    const reloaded = await prisma.channelConnection.findUniqueOrThrow({
      where: { businessId_channelType: { businessId: META_BIZ, channelType: "FACEBOOK" } },
    });
    expect(readMetaConnection(reloaded.configJson)).toBeNull();
    expect(reloaded.status).toBe("UNAVAILABLE");
    expect(reloaded.configJson).toContain("metaLastError");
  });

  it("reports both channel states without leaking tokens", async () => {
    await seedMetaChannel("FACEBOOK");
    await seedMetaChannel("INSTAGRAM", {
      connection: { ...storedMeta("instagram"), previousStatus: "TEST_MODE" },
    });

    const status = await getMetaStatus(META_BIZ);
    expect(status.facebook).toMatchObject({
      connected: true,
      status: "connected",
      pageId: PAGE_ID,
    });
    expect(status.instagram).toMatchObject({
      connected: true,
      status: "connected",
      igUsername: "test.brand",
    });
    expect(JSON.stringify(status)).not.toContain(PAGE_TOKEN);
    expect(JSON.stringify(status)).not.toContain("v1.");
  });

  it("clears credentials, unsubscribes once, and restores the previous channel mode", async () => {
    await seedMetaChannel("FACEBOOK");
    await seedMetaChannel("INSTAGRAM");
    const { fetchImpl, calls } = recorder(() => jsonResponse({ success: true }));

    const result = await disconnectMeta({
      businessId: META_BIZ,
      channel: "all",
      fetchImpl,
    });

    expect(result.facebook.connected).toBe(false);
    expect(result.instagram.connected).toBe(false);
    expect(calls.filter((call) => call.init?.method === "DELETE")).toHaveLength(1);

    const channels = await prisma.channelConnection.findMany({
      where: { businessId: META_BIZ, channelType: { in: ["FACEBOOK", "INSTAGRAM"] } },
    });
    for (const channel of channels) {
      expect(readMetaConnection(channel.configJson)).toBeNull();
      expect(channel.configJson).not.toContain("v1.");
      expect(channel.status).toBe("UNAVAILABLE");
      expect(channel.autoSend).toBe(false);
    }
  });

  it("starts from the pending selection when a new Meta connect is requested", async () => {
    await storeMetaPendingSelection({
      businessId: META_BIZ,
      userId: await ownerId(),
      pages: fetchedPages(),
    });
    const status = await getMetaStatus(META_BIZ);
    expect(status.pendingSelection).toBe(true);
    expect(status.pendingExpiresAt).toBeTruthy();
  });
});

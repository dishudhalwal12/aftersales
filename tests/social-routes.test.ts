import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/integration-crypto";

// Session guards are mocked so the suite exercises route behaviour without
// loading NextAuth. The real guard is covered by the app's auth tests.
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_social_owner",
    email: "social-owner@sphinx.demo",
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

import { GET as emailCallback } from "@/app/api/social/email/callback/route";
import { POST as emailConnect } from "@/app/api/social/email/connect/route";
import { POST as emailCredentials } from "@/app/api/social/email/credentials/route";
import { POST as emailDisconnect } from "@/app/api/social/email/disconnect/route";
import { GET as emailPoll } from "@/app/api/social/email/poll/route";
import { GET as emailStatus } from "@/app/api/social/email/status/route";
import { POST as emailWebhook } from "@/app/api/social/email/webhook/route";
import { GET as metaCallback } from "@/app/api/social/meta/callback/route";
import { GET as metaAssets } from "@/app/api/social/meta/assets/route";
import { GET as metaConnect } from "@/app/api/social/meta/connect/route";
import { POST as metaDisconnect } from "@/app/api/social/meta/disconnect/route";
import { POST as metaSelect } from "@/app/api/social/meta/select-asset/route";
import { POST as metaSend } from "@/app/api/social/meta/send/route";
import { GET as metaStatus } from "@/app/api/social/meta/status/route";
import {
  GET as metaWebhookGet,
  POST as metaWebhookPost,
} from "@/app/api/social/meta/webhook/route";

import { resetBusinessData } from "./helpers";

const OWNER_ID = "user_social_owner";
const OWNER_EMAIL = "social-owner@sphinx.demo";
const OTHER_OWNER_ID = "user_social_other";
const OTHER_OWNER_EMAIL = "social-other@sphinx.demo";
const BIZ_A = "test_social_route_a";
const BIZ_B = "test_social_route_b";
const APP_SECRET = "test-meta-app-secret";

function businessData(id: string, name: string, ownerId: string) {
  return {
    id,
    ownerId,
    name,
    businessType: "SaaS",
    description: "Social route test business.",
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

function get(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "GET", headers });
}

async function seedChannel(
  channelType: string,
  config: Record<string, unknown> = {},
  status = "UNAVAILABLE"
) {
  return prisma.channelConnection.create({
    data: {
      businessId: BIZ_A,
      channelType,
      status,
      autoSend: false,
      configJson: JSON.stringify(config),
    },
  });
}

beforeAll(async () => {
  await resetBusinessData([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_OWNER_EMAIL] } } });
  await prisma.user.create({
    data: { id: OWNER_ID, email: OWNER_EMAIL, name: "Social Owner" },
  });
  await prisma.user.create({
    data: { id: OTHER_OWNER_ID, email: OTHER_OWNER_EMAIL, name: "Other Owner" },
  });
  await prisma.business.create({ data: businessData(BIZ_A, "Social Business A", OWNER_ID) });
  await prisma.business.create({ data: businessData(BIZ_B, "Social Business B", OTHER_OWNER_ID) });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [BIZ_A, BIZ_B] } } },
  });
  await prisma.ticket.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
  await prisma.channelConnection.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await resetBusinessData([BIZ_A, BIZ_B]);
});

describe("email routes", () => {
  it("starts Gmail OAuth and never returns a client secret", async () => {
    const response = await emailConnect(
      post("http://localhost/api/social/email/connect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      provider: string;
      method: string;
      authorizationUrl: string;
    };
    expect(body.provider).toBe("gmail");
    expect(body.method).toBe("oauth");
    expect(body.authorizationUrl).toContain("accounts.google.com");
    expect(body.authorizationUrl).toContain("gmail.modify");
    expect(JSON.stringify(body)).not.toContain("test-gmail-client-secret");
  });

  it("rejects connect for another owner's business and missing businessId", async () => {
    const denied = await emailConnect(
      post("http://localhost/api/social/email/connect", { businessId: BIZ_B })
    );
    expect(denied.status).toBe(403);

    const invalid = await emailConnect(
      post("http://localhost/api/social/email/connect", {})
    );
    expect(invalid.status).toBe(400);
  });

  it("reports unsupported and unconfigured email providers", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    const unsupported = await emailConnect(
      post("http://localhost/api/social/email/connect", { businessId: BIZ_A })
    );
    expect(unsupported.status).toBe(400);
    expect(((await unsupported.json()) as { error: { code: string } }).error.code).toBe(
      "EMAIL_PROVIDER_NOT_SUPPORTED"
    );

    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    vi.stubEnv("EMAIL_GMAIL_CLIENT_ID", "");
    vi.stubEnv("EMAIL_GMAIL_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const unconfigured = await emailConnect(
      post("http://localhost/api/social/email/connect", { businessId: BIZ_A })
    );
    expect(unconfigured.status).toBe(503);
  });

  it("requires OAuth and rejects API-key credential posts", async () => {
    const response = await emailCredentials(
      post("http://localhost/api/social/email/credentials", {
        businessId: BIZ_A,
        provider: "gmail",
        credentials: { password: "not-a-real-password" },
      })
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "EMAIL_OAUTH_REQUIRED"
    );
  });

  it("reports disconnected, error, and cross-tenant status without token fields", async () => {
    const disconnected = await emailStatus(
      get(`http://localhost/api/social/email/status?businessId=${BIZ_A}`)
    );
    expect(disconnected.status).toBe(200);
    const disconnectedBody = (await disconnected.json()) as Record<string, unknown>;
    expect(disconnectedBody).toMatchObject({ connected: false, status: "disconnected" });
    expect(JSON.stringify(disconnectedBody)).not.toContain("refresh");

    await seedChannel("GMAIL", { emailLastError: "Google denied access." });
    const errored = await emailStatus(
      get(`http://localhost/api/social/email/status?businessId=${BIZ_A}`)
    );
    expect(((await errored.json()) as { status: string }).status).toBe("error");

    const denied = await emailStatus(
      get(`http://localhost/api/social/email/status?businessId=${BIZ_B}`)
    );
    expect(denied.status).toBe(403);
  });

  it("404s disconnect when no mailbox is connected", async () => {
    const response = await emailDisconnect(
      post("http://localhost/api/social/email/disconnect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "EMAIL_NOT_CONNECTED"
    );
  });

  it("keeps the Gmail webhook honest and documents polling", async () => {
    const response = await emailWebhook();
    expect(response.status).toBe(501);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("/api/social/email/poll");
  });

  it("guards the polling job with CRON_SECRET", async () => {
    const unauthorized = await emailPoll(get("http://localhost/api/social/email/poll"));
    expect(unauthorized.status).toBe(401);

    const wrong = await emailPoll(
      get("http://localhost/api/social/email/poll", { authorization: "Bearer wrong" })
    );
    expect(wrong.status).toBe(401);

    const ok = await emailPoll(
      get("http://localhost/api/social/email/poll", {
        authorization: "Bearer test-cron-secret",
      })
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { businesses: number }).businesses).toBe(0);

    vi.stubEnv("CRON_SECRET", "");
    const disabled = await emailPoll(get("http://localhost/api/social/email/poll"));
    expect(disabled.status).toBe(503);
  });

  it("rejects an invalid OAuth state on the callback", async () => {
    const response = await emailCallback(
      get("http://localhost/api/social/email/callback?state=forged&code=abc")
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "OAUTH_STATE_INVALID"
    );
  });
});

describe("meta routes", () => {
  it("redirects to the Meta OAuth dialog", async () => {
    const response = await metaConnect(
      get(`http://localhost/api/social/meta/connect?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("facebook.com/v26.0/dialog/oauth");
    expect(location).toContain("test-meta-app-id");
    expect(location).toContain("instagram_manage_messages");
    expect(location).not.toContain(APP_SECRET);

    const denied = await metaConnect(
      get(`http://localhost/api/social/meta/connect?businessId=${BIZ_B}`)
    );
    expect(denied.status).toBe(403);
  });

  it("reports Meta status without credentials", async () => {
    const response = await metaStatus(
      get(`http://localhost/api/social/meta/status?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      facebook: { connected: boolean };
      instagram: { connected: boolean };
      pendingSelection: boolean;
    };
    expect(body.facebook.connected).toBe(false);
    expect(body.instagram.connected).toBe(false);
    expect(body.pendingSelection).toBe(false);
    expect(JSON.stringify(body)).not.toContain("v1.");
  });

  it("returns 410 for assets and selection when no Meta authorization is pending", async () => {
    const assets = await metaAssets(
      get(`http://localhost/api/social/meta/assets?businessId=${BIZ_A}`)
    );
    expect(assets.status).toBe(410);

    const select = await metaSelect(
      post("http://localhost/api/social/meta/select-asset", {
        businessId: BIZ_A,
        kind: "page",
        assetId: "page_1",
      })
    );
    expect(select.status).toBe(410);
  });

  it("serves the pending assets fetched during OAuth", async () => {
    await seedChannel("FACEBOOK", {
      metaPending: {
        userId: OWNER_ID,
        pages: [
          {
            id: "page_1",
            name: "Page One",
            token: encryptSecret("page-token"),
            instagram: { id: "ig_1", username: "brand.one", name: "Brand One" },
          },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
    });

    const response = await metaAssets(
      get(`http://localhost/api/social/meta/assets?businessId=${BIZ_A}`)
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { assets: Array<{ kind: string; id: string }> };
    expect(body.assets.map((asset) => `${asset.kind}:${asset.id}`)).toEqual([
      "page:page_1",
      "instagram:ig_1",
    ]);
    expect(JSON.stringify(body)).not.toContain("page-token");
  });

  it("refuses to send through a channel that is not connected", async () => {
    const response = await metaSend(
      post("http://localhost/api/social/meta/send", {
        businessId: BIZ_A,
        channel: "facebook",
        recipientId: "psid",
        text: "Hello",
      })
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "META_NOT_CONNECTED"
    );
  });

  it("disconnects cleanly when nothing is connected", async () => {
    const response = await metaDisconnect(
      post("http://localhost/api/social/meta/disconnect", { businessId: BIZ_A })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      facebook: { connected: boolean };
      instagram: { connected: boolean };
    };
    expect(body.facebook.connected).toBe(false);
    expect(body.instagram.connected).toBe(false);
  });

  it("completes the webhook verification handshake", async () => {
    const ok = await metaWebhookGet(
      get(
        "http://localhost/api/social/meta/webhook?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=abc123"
      )
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("abc123");

    const denied = await metaWebhookGet(
      get(
        "http://localhost/api/social/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123"
      )
    );
    expect(denied.status).toBe(403);
  });

  it("verifies webhook signatures and acknowledges unknown assets", async () => {
    const raw = JSON.stringify({
      object: "page",
      entry: [{ id: "page_unknown", messaging: [] }],
    });
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;

    const response = await metaWebhookPost(
      new Request("http://localhost/api/social/meta/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature,
        },
        body: raw,
      })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; ignored: number };
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe(1);

    const unsigned = await metaWebhookPost(
      new Request("http://localhost/api/social/meta/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      })
    );
    expect(unsigned.status).toBe(401);
  });

  it("rejects an invalid OAuth state on the Meta callback", async () => {
    const response = await metaCallback(
      get("http://localhost/api/social/meta/callback?state=forged&code=abc")
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "OAUTH_STATE_INVALID"
    );
  });
});

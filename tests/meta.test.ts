import { strict as assert } from "node:assert";
import { createHmac, randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { encryptSecret } from "../src/server/integrations/crypto.ts";
import { IntegrationError } from "../src/server/integrations/errors.ts";
import {
  META_PENDING_KEY,
  buildMetaAuthorizationUrl,
  exchangeMetaCode,
  fetchMetaPages,
  readMetaConnection,
  readMetaPending,
  readMetaSettings,
  summarizeMetaChannel,
  toMetaAssets,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
} from "../src/server/integrations/meta.ts";
import { channel, fetchStub, jsonResponse } from "./integrations-helpers.ts";

const ENV_KEYS = [
  "INTEGRATION_ENCRYPTION_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_GRAPH_VERSION",
  "META_WEBHOOK_VERIFY_TOKEN",
] as const;
const saved = new Map<string, string | undefined>();

function integrationError(reason: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof IntegrationError, `expected IntegrationError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  };
}

function metaConnectionConfig(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    metaConnection: {
      kind: "page",
      assetId: "page_1",
      pageId: "page_1",
      pageName: "CloudPulse",
      igId: "ig_1",
      igUsername: "cloudpulse.app",
      token: encryptSecret("page-access-token"),
      scopes: ["pages_messaging"],
      graphVersion: "v26.0",
      connectedAt: "2026-10-01T00:00:00.000Z",
      previousStatus: "TEST_MODE",
      previousAutoSend: false,
      ...overrides,
    },
  });
}

before(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.META_APP_ID = "app-id-123";
  process.env.META_APP_SECRET = "app-secret-456";
  process.env.META_GRAPH_VERSION = "v26.0";
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
});

after(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Meta app settings", () => {
  it("reads the app id, secret, and verify token", () => {
    const settings = readMetaSettings();
    assert.equal(settings.appId, "app-id-123");
    assert.equal(settings.appSecret, "app-secret-456");
    assert.equal(settings.verifyToken, "verify-token");
    assert.equal(settings.configured, true);
  });

  it("falls back to a safe Graph version when META_GRAPH_VERSION is malformed", () => {
    process.env.META_GRAPH_VERSION = "v26";
    assert.equal(readMetaSettings().graphVersion, "v26.0");
    process.env.META_GRAPH_VERSION = "latest";
    assert.match(readMetaSettings().graphVersion, /^v\d+\.\d+$/);
    process.env.META_GRAPH_VERSION = "v26.0";
  });

  it("is not configured without an app secret", () => {
    delete process.env.META_APP_SECRET;
    assert.equal(readMetaSettings().configured, false);
    process.env.META_APP_SECRET = "app-secret-456";
  });
});

describe("Meta authorization", () => {
  it("builds the Facebook Login dialog with the expected scopes", () => {
    const url = new URL(
      buildMetaAuthorizationUrl({
        redirectUri: "https://example.com/api/social/meta/callback",
        state: "signed-state",
      }),
    );

    assert.equal(url.origin, "https://www.facebook.com");
    assert.equal(url.pathname, "/v26.0/dialog/oauth");
    assert.equal(url.searchParams.get("client_id"), "app-id-123");
    assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/social/meta/callback");
    assert.equal(url.searchParams.get("state"), "signed-state");
    assert.equal(url.searchParams.get("response_type"), "code");
    const scopes = url.searchParams.get("scope") ?? "";
    assert.match(scopes, /pages_messaging/);
    assert.match(scopes, /instagram_basic/);
  });

  it("refuses to build a dialog when the app is not configured", () => {
    delete process.env.META_APP_ID;
    assert.throws(
      () => buildMetaAuthorizationUrl({ redirectUri: "https://example.com/cb", state: "s" }),
      integrationError("META_NOT_CONFIGURED"),
    );
    process.env.META_APP_ID = "app-id-123";
  });

  it("exchanges the code for a short-lived token, then a long-lived one", async () => {
    const fetch = fetchStub((url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("grant_type") === "fb_exchange_token") {
        return jsonResponse({ access_token: "long-lived-token", expires_in: 5_000_000 });
      }
      return jsonResponse({ access_token: "short-lived-token", expires_in: 3600 });
    });

    const result = await exchangeMetaCode({
      code: "auth-code",
      redirectUri: "https://example.com/cb",
      fetchImpl: fetch.impl,
    });

    assert.equal(result.accessToken, "long-lived-token");
    assert.equal(result.expiresInSeconds, 5_000_000);
    assert.equal(fetch.calls.length, 2);

    const first = new URL(fetch.calls[0]?.url ?? "");
    assert.equal(first.searchParams.get("code"), "auth-code");
    assert.equal(first.searchParams.get("client_secret"), "app-secret-456");

    const second = new URL(fetch.calls[1]?.url ?? "");
    assert.equal(second.searchParams.get("grant_type"), "fb_exchange_token");
    assert.equal(second.searchParams.get("fb_exchange_token"), "short-lived-token");
  });

  it("reports invalid provider credentials from the code exchange", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({ error: { message: "Invalid verification code format", code: 100 } }, 400),
    );

    await assert.rejects(
      () => exchangeMetaCode({ code: "expired", redirectUri: "https://example.com/cb", fetchImpl: fetch.impl }),
      integrationError("META_OAUTH_FAILED"),
    );
  });

  it("fails instead of silently keeping the short-lived token", async () => {
    const fetch = fetchStub((url) => {
      if (url.includes("fb_exchange_token")) {
        return jsonResponse({ error: { message: "cannot exchange" } }, 400);
      }
      return jsonResponse({ access_token: "short-lived-token" });
    });

    await assert.rejects(
      () => exchangeMetaCode({ code: "code", redirectUri: "https://example.com/cb", fetchImpl: fetch.impl }),
      integrationError("META_TOKEN_EXCHANGE_FAILED"),
    );
  });
});

describe("Meta asset discovery", () => {
  it("maps Pages and linked Instagram accounts and skips Pages without a token", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({
        data: [
          {
            id: "page_1",
            name: "CloudPulse",
            access_token: "page-1-token",
            instagram_business_account: { id: "ig_1", username: "cloudpulse.app", name: "CloudPulse" },
          },
          {
            id: "page_2",
            name: "CloudPulse Support",
            access_token: "page-2-token",
            instagram_business_account: { data: [{ id: "ig_2", username: "cloudpulse.support" }] },
          },
          { id: "page_3", name: "No token" },
        ],
      }),
    );

    const pages = await fetchMetaPages("user-token", fetch.impl);

    assert.equal(pages.length, 2);
    assert.equal(pages[0]?.id, "page_1");
    assert.deepEqual(pages[0]?.instagram, { id: "ig_1", username: "cloudpulse.app", name: "CloudPulse" });
    assert.equal(pages[1]?.instagram?.id, "ig_2");
    assert.equal(pages[1]?.instagram?.name, "cloudpulse.support");

    const headers = (fetch.calls[0]?.init?.headers as Record<string, string> | undefined) ?? {};
    assert.equal(headers["authorization"], "Bearer user-token");
  });

  it("does not follow a paging.next that leaves the Graph host", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({
        data: [{ id: "page_1", name: "CloudPulse", access_token: "token" }],
        paging: { next: "https://attacker.example/steal" },
      }),
    );

    await fetchMetaPages("user-token", fetch.impl);
    assert.equal(fetch.calls.length, 1);
  });

  it("surfaces a Graph error instead of returning an empty asset list", async () => {
    const fetch = fetchStub(() => jsonResponse({ error: { message: "Invalid OAuth access token" } }, 400));

    await assert.rejects(() => fetchMetaPages("bad-token", fetch.impl), integrationError("META_ASSETS_FAILED"));
  });

  it("expands stored Pages into Page and Instagram assets", () => {
    const assets = toMetaAssets([
      {
        id: "page_1",
        name: "CloudPulse",
        token: "encrypted",
        instagram: { id: "ig_1", username: "cloudpulse.app", name: "CloudPulse IG" },
      },
    ]);

    assert.deepEqual(assets, [
      {
        kind: "page",
        id: "page_1",
        name: "CloudPulse",
        username: null,
        pageId: "page_1",
        pageName: "CloudPulse",
      },
      {
        kind: "instagram",
        id: "ig_1",
        name: "CloudPulse IG",
        username: "cloudpulse.app",
        pageId: "page_1",
        pageName: "CloudPulse",
      },
    ]);
  });
});

describe("stored Meta selections", () => {
  it("keeps Page tokens encrypted at rest and binds the selection to a user", () => {
    const pending = {
      userId: "user_1",
      pages: [
        {
          id: "page_1",
          name: "CloudPulse",
          token: encryptSecret("page-access-token"),
          instagram: { id: "ig_1", username: "cloudpulse.app", name: "CloudPulse" },
        },
      ],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1_200_000).toISOString(),
    };
    const configJson = JSON.stringify({ [META_PENDING_KEY]: pending });

    assert.equal(configJson.includes("page-access-token"), false);
    const restored = readMetaPending(configJson);
    assert.ok(restored);
    assert.equal(restored.userId, "user_1");
    assert.equal(restored.pages.length, 1);
    assert.equal(restored.pages[0]?.id, "page_1");
  });

  it("ignores an expired selection so a stale callback cannot pick an account", () => {
    const pending = {
      userId: "user_1",
      pages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };

    assert.equal(readMetaPending(JSON.stringify({ [META_PENDING_KEY]: pending })), null);
  });

  it("requires the selection to have an owning user", () => {
    const pending = {
      pages: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    assert.equal(readMetaPending(JSON.stringify({ [META_PENDING_KEY]: pending })), null);
  });

  it("validates a stored Meta connection and fills safe defaults", () => {
    const connection = readMetaConnection(metaConnectionConfig());
    assert.ok(connection);
    assert.equal(connection.kind, "page");
    assert.equal(connection.pageName, "CloudPulse");
    assert.equal(connection.igUsername, "cloudpulse.app");
    assert.equal(connection.token.startsWith("v1."), true);

    assert.equal(
      readMetaConnection(JSON.stringify({ metaConnection: { kind: "unknown", assetId: "x", pageId: "y", token: "t" } })),
      null,
    );
    assert.equal(readMetaConnection(null), null);
  });
});

describe("Meta channel summaries", () => {
  it("reports a missing channel as disconnected", () => {
    assert.deepEqual(summarizeMetaChannel(null), {
      connected: false,
      status: "disconnected",
      kind: null,
      pageId: null,
      pageName: null,
      igUsername: null,
      connectedAt: null,
      lastError: null,
    });
  });

  it("only calls a channel connected when the row itself is CONNECTED", () => {
    const connected = summarizeMetaChannel(
      channel(
        JSON.parse(metaConnectionConfig()) as Record<string, unknown>,
        { channelType: "FACEBOOK", status: "CONNECTED" },
      ),
    );
    assert.equal(connected.connected, true);
    assert.equal(connected.status, "connected");
    assert.equal(connected.pageName, "CloudPulse");

    const draft = summarizeMetaChannel(
      channel(
        JSON.parse(metaConnectionConfig()) as Record<string, unknown>,
        { channelType: "FACEBOOK", status: "TEST_MODE" },
      ),
    );
    assert.equal(draft.connected, false);
    assert.equal(draft.status, "disconnected");
  });

  it("surfaces the stored integration error", () => {
    const summary = summarizeMetaChannel(
      channel({ metaLastError: "Meta rejected the Page access token." }, { channelType: "FACEBOOK", status: "TEST_MODE" }),
    );
    assert.equal(summary.status, "error");
    assert.equal(summary.lastError, "Meta rejected the Page access token.");
  });
});

describe("Meta webhook authenticity", () => {
  const rawBody = JSON.stringify({ object: "page", entry: [] });
  const secret = "app-secret-456";

  it("accepts a correctly signed payload", () => {
    const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    assert.equal(verifyMetaSignature(rawBody, `sha256=${signature}`, secret), true);
    assert.equal(verifyMetaSignature(rawBody, `sha256=${signature.toUpperCase()}`, secret), true);
  });

  it("rejects a wrong secret, missing signature, or malformed digest", () => {
    const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    assert.equal(verifyMetaSignature(rawBody, `sha256=${signature}`, "other-secret"), false);
    assert.equal(verifyMetaSignature(rawBody, null, secret), false);
    assert.equal(verifyMetaSignature(rawBody, signature, secret), false);
    assert.equal(verifyMetaSignature(rawBody, "sha256=not-hex", secret), false);
    assert.equal(verifyMetaSignature(rawBody, `sha256=${"0".repeat(64)}`, secret), false);
    assert.equal(verifyMetaSignature(rawBody, `sha256=${signature}`, ""), false);
  });

  it("answers the subscription handshake only for the configured token", () => {
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "verify-token",
        challenge: "challenge-123",
        expectedToken: "verify-token",
      }),
      "challenge-123",
    );
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "wrong-token",
        challenge: "challenge-123",
        expectedToken: "verify-token",
      }),
      null,
    );
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "unsubscribe",
        token: "verify-token",
        challenge: "challenge-123",
        expectedToken: "verify-token",
      }),
      null,
    );
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "verify-token",
        challenge: null,
        expectedToken: "verify-token",
      }),
      null,
    );
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "verify-token",
        challenge: "challenge-123",
        expectedToken: "",
      }),
      null,
    );
  });
});

import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import type { InboundContact } from "../src/server/business/service.ts";
import {
  GMAIL_SCOPES,
  buildGmailAuthorizationUrl,
  buildGmailRawMessage,
  getValidGmailAccessToken,
  isEmailProviderSupported,
  parseEmailAddress,
  processGmailMessage,
  readEmailConnection,
  readEmailProviderSettings,
  readGmailHeader,
  sanitizeHeaderValue,
  type GmailMessagePayload,
} from "../src/server/integrations/email.ts";
import { encryptSecret } from "../src/server/integrations/crypto.ts";
import { IntegrationError } from "../src/server/integrations/errors.ts";
import {
  base64Url,
  business,
  channel,
  fetchStub,
  jsonResponse,
  requestJson,
  respondResult,
} from "./integrations-helpers.ts";

const ENV_KEYS = [
  "INTEGRATION_ENCRYPTION_KEY",
  "INTEGRATION_STATE_SECRET",
  "EMAIL_PROVIDER",
  "EMAIL_GMAIL_CLIENT_ID",
  "EMAIL_GMAIL_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;
const saved = new Map<string, string | undefined>();

function integrationError(reason: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof IntegrationError, `expected IntegrationError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  };
}

function storedEmailConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: {
      provider: "gmail",
      emailAddress: "support@cloudpulse.example",
      accountId: "account_1",
      refreshToken: encryptSecret("refresh-token"),
      accessToken: encryptSecret("access-token"),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scopes: [...GMAIL_SCOPES],
      connectedAt: "2026-01-01T00:00:00.000Z",
      previousStatus: "TEST_MODE",
      previousAutoSend: false,
      ...overrides,
    },
  };
}

function gmailMessage(overrides: Partial<GmailMessagePayload> = {}): GmailMessagePayload {
  return {
    id: "msg_1",
    threadId: "thread_1",
    labelIds: ["UNREAD", "INBOX"],
    snippet: "",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Priya Sharma <Priya@Example.com>" },
        { name: "Subject", value: "Refund" },
        { name: "Message-ID", value: "<abc@mail.example.com>" },
        { name: "References", value: "<parent@mail.example.com>" },
      ],
      body: { data: base64Url("Can I still get a refund?") },
    },
    ...overrides,
  };
}

function healthyGmailFetch(sendStatus = 200) {
  return fetchStub((url) => {
    if (url.endsWith("/messages/send")) {
      return sendStatus === 200
        ? jsonResponse({ id: "sent_1", threadId: "thread_1" })
        : jsonResponse({ error: { message: "upstream failed" } }, sendStatus);
    }
    if (url.includes("/modify")) return jsonResponse({ id: "msg_1" });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

before(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.INTEGRATION_STATE_SECRET = "state-secret-for-tests";
});

after(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Gmail provider settings", () => {
  it("only implements Gmail instead of pretending other providers exist", () => {
    assert.equal(isEmailProviderSupported("gmail"), true);
    assert.equal(isEmailProviderSupported("outlook"), false);
    assert.equal(isEmailProviderSupported("sendgrid"), false);
  });

  it("reports unconfigured when the OAuth client is missing", () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_GMAIL_CLIENT_ID;
    delete process.env.EMAIL_GMAIL_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const settings = readEmailProviderSettings();
    assert.equal(settings.provider, "gmail");
    assert.equal(settings.configured, false);
  });

  it("falls back to the shared Google OAuth client", () => {
    delete process.env.EMAIL_GMAIL_CLIENT_ID;
    delete process.env.EMAIL_GMAIL_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const settings = readEmailProviderSettings();
    assert.equal(settings.clientId, "google-client-id");
    assert.equal(settings.clientSecret, "google-client-secret");
    assert.equal(settings.configured, true);
  });

  it("does not claim to be configured for an unsupported provider", () => {
    process.env.EMAIL_PROVIDER = "outlook";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const settings = readEmailProviderSettings();
    assert.equal(settings.provider, "outlook");
    assert.equal(settings.configured, false);
  });
});

describe("Gmail authorization URL", () => {
  before(() => {
    delete process.env.EMAIL_PROVIDER;
    process.env.EMAIL_GMAIL_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.EMAIL_GMAIL_CLIENT_SECRET = "client-secret";
  });

  it("requests offline access with consent so a refresh token is issued", () => {
    const url = new URL(
      buildGmailAuthorizationUrl({
        redirectUri: "https://example.com/api/social/email/callback",
        state: "signed-state",
      }),
    );

    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), "client-id.apps.googleusercontent.com");
    assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/social/email/callback");
    assert.equal(url.searchParams.get("state"), "signed-state");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...GMAIL_SCOPES]);
  });
});

describe("stored email connection validation", () => {
  it("returns null for a missing or malformed credential", () => {
    assert.equal(readEmailConnection(null), null);
    assert.equal(readEmailConnection("not json"), null);
    assert.equal(readEmailConnection(JSON.stringify({ email: { provider: "gmail" } })), null);
    assert.equal(
      readEmailConnection(
        JSON.stringify({ email: { provider: "outlook", emailAddress: "a@b.c", refreshToken: "x" } }),
      ),
      null,
    );
  });

  it("reads the provider fields without decrypting them", () => {
    const connection = readEmailConnection(JSON.stringify(storedEmailConfig()));
    assert.ok(connection);
    assert.equal(connection.emailAddress, "support@cloudpulse.example");
    assert.deepEqual(connection.scopes, [...GMAIL_SCOPES]);
    assert.equal(connection.refreshToken.startsWith("v1."), true);
  });
});

describe("outbound MIME construction", () => {
  it("strips CRLF so a header value cannot inject a new header", () => {
    assert.equal(sanitizeHeaderValue("Hello\r\nBcc: attacker@example.com"), "Hello Bcc: attacker@example.com");
    assert.equal(sanitizeHeaderValue("  padded\n"), "padded");
  });

  it("builds RFC 5322 headers and base64 body", () => {
    const raw = buildGmailRawMessage({
      from: "support@cloudpulse.example",
      to: "priya@example.com",
      subject: "Re: Refund",
      text: "Yes — within 7 days.",
      inReplyTo: "<abc@mail.example.com>",
      references: "<parent@mail.example.com> <abc@mail.example.com>",
    });

    const mime = Buffer.from(raw, "base64url").toString("utf8");
    assert.match(mime, /^From: support@cloudpulse\.example\r\n/);
    assert.match(mime, /\r\nTo: priya@example\.com\r\n/);
    assert.match(mime, /\r\nSubject: Re: Refund\r\n/);
    assert.match(mime, /\r\nIn-Reply-To: <abc@mail\.example\.com>\r\n/);
    assert.match(mime, /\r\nReferences: <parent@mail\.example\.com> <abc@mail\.example\.com>\r\n/);
    assert.match(mime, /Content-Transfer-Encoding: base64/);

    const body = mime.split("\r\n\r\n")[1] ?? "";
    assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "Yes — within 7 days.");
  });

  it("neutralises CRLF inside the subject", () => {
    const raw = buildGmailRawMessage({
      from: "support@cloudpulse.example",
      to: "priya@example.com",
      subject: "Hello\r\nBcc: attacker@example.com",
      text: "hi",
    });
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    assert.equal(mime.includes("\r\nBcc:"), false);
    assert.match(mime, /\r\nSubject: Hello Bcc: attacker@example\.com\r\n/);
  });
});

describe("inbound parsing helpers", () => {
  it("parses a display name and normalises the address", () => {
    assert.deepEqual(parseEmailAddress('Priya Sharma <Priya@Example.com>'), {
      email: "priya@example.com",
      name: "Priya Sharma",
    });
    assert.deepEqual(parseEmailAddress("PRIYA@EXAMPLE.COM"), { email: "priya@example.com", name: "" });
  });

  it("matches Gmail headers case-insensitively", () => {
    const headers = [{ name: "Message-ID", value: " <abc@x> " }];
    assert.equal(readGmailHeader(headers, "message-id"), "<abc@x>");
    assert.equal(readGmailHeader(headers, "references"), "");
    assert.equal(readGmailHeader(undefined, "from"), "");
  });
});

describe("access-token lifecycle", () => {
  before(() => {
    delete process.env.EMAIL_PROVIDER;
    process.env.EMAIL_GMAIL_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.EMAIL_GMAIL_CLIENT_SECRET = "client-secret";
  });

  it("reuses a cached token that is comfortably before expiry", async () => {
    const { impl, calls } = fetchStub(() => {
      throw new Error("no network call should happen for a valid cached token");
    });

    const result = await getValidGmailAccessToken(channel(storedEmailConfig()), impl);
    assert.equal(result.accessToken, "access-token");
    assert.equal(calls.length, 0);
  });

  it("refreshes an expired token with the stored refresh token", async () => {
    const expired = channel(
      storedEmailConfig({ accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    const { impl, calls } = fetchStub(() =>
      jsonResponse({ error: "server_error", error_description: "temporarily unavailable" }, 500),
    );

    await assert.rejects(
      () => getValidGmailAccessToken(expired, impl),
      integrationError("EMAIL_TOKEN_REFRESH_FAILED"),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "refresh-token");
    assert.equal(body.get("client_id"), "client-id.apps.googleusercontent.com");
  });

  it("refuses to use a channel that is not connected", async () => {
    const { impl } = fetchStub(() => jsonResponse({}));
    await assert.rejects(
      () => getValidGmailAccessToken(channel(storedEmailConfig(), { status: "TEST_MODE" }), impl),
      integrationError("EMAIL_NOT_CONNECTED"),
    );
  });
});

describe("inbound email processing", () => {
  it("rejects a channel with no stored email credential", async () => {
    await assert.rejects(
      () => processGmailMessage(channel({}), business(), gmailMessage()),
      integrationError("EMAIL_NOT_CONNECTED"),
    );
  });

  it("ignores mail the business sent to itself", async () => {
    const contacts: InboundContact[] = [];
    const message = gmailMessage({
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Support <SUPPORT@cloudpulse.example>" },
          { name: "Subject", value: "Own note" },
        ],
        body: { data: base64Url("internal note") },
      },
    });

    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), message, {
      fetch: healthyGmailFetch().impl,
      respond: async (contact) => {
        contacts.push(contact);
        return respondResult();
      },
    });

    assert.equal(outcome.skipped, "self_authored");
    assert.equal(contacts.length, 0);
  });

  it("ignores messages already marked SENT", async () => {
    const outcome = await processGmailMessage(
      channel(storedEmailConfig()),
      business(),
      gmailMessage({ labelIds: ["SENT"] }),
      { fetch: healthyGmailFetch().impl, respond: async () => respondResult() },
    );

    assert.equal(outcome.skipped, "self_authored");
  });

  it("ignores an empty message body instead of creating a ticket", async () => {
    const message = gmailMessage({
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "From", value: "priya@example.com" }],
        body: { data: base64Url("   ") },
      },
    });

    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), message, {
      fetch: healthyGmailFetch().impl,
      respond: async () => respondResult(),
    });

    assert.equal(outcome.skipped, "empty_body");
  });

  it("hands a real message to the shared pipeline and auto-replies in-thread", async () => {
    const contacts: InboundContact[] = [];
    const fetch = healthyGmailFetch();

    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), gmailMessage(), {
      fetch: fetch.impl,
      respond: async (contact) => {
        contacts.push(contact);
        return respondResult();
      },
    });

    assert.equal(outcome.duplicate, false);
    assert.equal(outcome.replySent, true);
    assert.equal(outcome.replyError, null);
    assert.equal(outcome.ticketId, "ticket_1");

    const contact = contacts[0];
    assert.ok(contact);
    assert.equal(contact.channel, "GMAIL");
    assert.equal(contact.externalMessageId, "gmail:msg_1");
    assert.equal(contact.customerHandle, "priya@example.com");
    assert.equal(contact.customerName, "Priya Sharma");
    assert.equal(contact.query, "Can I still get a refund?");

    const sendCall = fetch.calls.find((call) => call.url.endsWith("/messages/send"));
    assert.ok(sendCall);
    const payload = requestJson(sendCall) as { raw: string; threadId?: string };
    assert.equal(payload.threadId, "thread_1");
    const mime = Buffer.from(payload.raw, "base64url").toString("utf8");
    assert.match(mime, /\r\nTo: priya@example\.com\r\n/);
    assert.match(mime, /\r\nSubject: Re: Refund\r\n/);
    assert.match(mime, /\r\nIn-Reply-To: <abc@mail\.example\.com>\r\n/);

    const auth = (sendCall.init?.headers as Record<string, string> | undefined)?.["authorization"];
    assert.equal(auth, "Bearer access-token");

    const readCall = fetch.calls.find((call) => call.url.includes("/modify"));
    assert.ok(readCall);
    assert.deepEqual(requestJson(readCall), { removeLabelIds: ["UNREAD"] });
  });

  it("does not send a second reply for a duplicate delivery", async () => {
    const fetch = healthyGmailFetch();
    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), gmailMessage(), {
      fetch: fetch.impl,
      respond: async () => respondResult({ duplicate: true, ticketId: "ticket_existing" }),
    });

    assert.equal(outcome.duplicate, true);
    assert.equal(outcome.ticketId, "ticket_existing");
    assert.equal(outcome.replySent, false);
    assert.equal(fetch.calls.some((call) => call.url.endsWith("/messages/send")), false);
    assert.equal(fetch.calls.some((call) => call.url.includes("/modify")), true);
  });

  it("holds the reply when routing says draft-only", async () => {
    const fetch = healthyGmailFetch();
    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), gmailMessage(), {
      fetch: fetch.impl,
      respond: async () => respondResult({ shouldAutoSend: false, actionStatus: "draft", routingRuleHit: "R5" }),
    });

    assert.equal(outcome.replySent, false);
    assert.equal(fetch.calls.some((call) => call.url.endsWith("/messages/send")), false);
  });

  it("keeps an empty answer from being sent", async () => {
    const fetch = healthyGmailFetch();
    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), gmailMessage(), {
      fetch: fetch.impl,
      respond: async () => respondResult({ answer: "   " }),
    });

    assert.equal(outcome.replySent, false);
    assert.equal(fetch.calls.some((call) => call.url.endsWith("/messages/send")), false);
  });

  it("records a send failure without losing the ticket or the read receipt", async () => {
    const fetch = healthyGmailFetch(500);
    const outcome = await processGmailMessage(channel(storedEmailConfig()), business(), gmailMessage(), {
      fetch: fetch.impl,
      respond: async () => respondResult(),
    });

    assert.equal(outcome.replySent, false);
    assert.equal(outcome.replyError, "EMAIL_SEND_FAILED");
    assert.equal(fetch.calls.some((call) => call.url.includes("/modify")), true);
  });
});

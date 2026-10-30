import type { ChannelConnection } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  GMAIL_SCOPES,
  buildGmailAuthorizationUrl,
  buildGmailRawMessage,
  completeEmailConnection,
  disconnectEmail,
  exchangeGmailCode,
  getEmailStatus,
  getValidGmailAccessToken,
  pollGmailChannel,
  readEmailConnection,
  sendGmailMessage,
  type EmailFetch,
} from "@/lib/email";
import { decryptSecret, encryptSecret } from "@/lib/integration-crypto";
import type { generateTriageResponse } from "@/lib/llm-orchestrator";
import type { LLMResponse } from "@/lib/routing-engine";

import { createTestBusiness, resetBusinessData } from "./helpers";

const EMAIL_BIZ = "test_email_biz";
const EMAIL_OWNER_EMAIL = "email-owner@sphinx.demo";
const CHUNK_ID = "chk_email_pricing";
const SUPPORT_ADDRESS = "support@business.test";
const ACCESS_TOKEN = "access-token-1";
const REFRESH_TOKEN = "refresh-token-1";

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
  fetchImpl: EmailFetch;
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

function storedEmail(overrides: Record<string, unknown> = {}) {
  return {
    provider: "gmail",
    emailAddress: SUPPORT_ADDRESS,
    accountId: SUPPORT_ADDRESS,
    refreshToken: encryptSecret(REFRESH_TOKEN),
    accessToken: encryptSecret(ACCESS_TOKEN),
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scopes: [...GMAIL_SCOPES],
    connectedAt: new Date().toISOString(),
    previousStatus: "DRAFT_ONLY",
    previousAutoSend: false,
    ...overrides,
  };
}

async function seedGmailChannel(options: {
  status?: string;
  autoSend?: boolean;
  email?: Record<string, unknown> | null;
  extraConfig?: Record<string, unknown>;
} = {}): Promise<ChannelConnection> {
  await prisma.channelConnection.deleteMany({
    where: { businessId: EMAIL_BIZ, channelType: "GMAIL" },
  });
  const config = {
    email: options.email === null ? null : storedEmail(options.email ?? {}),
    ...(options.extraConfig ?? {}),
  };
  return prisma.channelConnection.create({
    data: {
      businessId: EMAIL_BIZ,
      channelType: "GMAIL",
      status: options.status ?? "CONNECTED",
      autoSend: options.autoSend ?? true,
      configJson: JSON.stringify(config),
    },
  });
}

function gmailMessage(input: {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  text: string;
  messageId?: string;
}) {
  return {
    id: input.id,
    threadId: input.threadId ?? `thread_${input.id}`,
    labelIds: ["UNREAD", "INBOX"],
    snippet: input.text.slice(0, 80),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: input.from },
        { name: "To", value: SUPPORT_ADDRESS },
        { name: "Subject", value: input.subject },
        { name: "Message-ID", value: input.messageId ?? `<${input.id}@mail.example.com>` },
        { name: "References", value: "<root@mail.example.com>" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from(input.text, "utf8").toString("base64url") },
        },
      ],
    },
  };
}

beforeAll(async () => {
  await resetBusinessData([EMAIL_BIZ]);
  await createTestBusiness({
    id: EMAIL_BIZ,
    ownerEmail: EMAIL_OWNER_EMAIL,
    name: "Email Test Business",
  });
  await prisma.knowledgeChunk.create({
    data: {
      id: CHUNK_ID,
      businessId: EMAIL_BIZ,
      chunkIndex: 0,
      section: "Pricing",
      content: "The Pro Plan costs ₹1,499 per month.",
      keywords: "pro plan pricing",
    },
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({ where: { ticket: { businessId: EMAIL_BIZ } } });
  await prisma.ticket.deleteMany({ where: { businessId: EMAIL_BIZ } });
  await prisma.channelConnection.deleteMany({ where: { businessId: EMAIL_BIZ } });
});

afterAll(async () => {
  await resetBusinessData([EMAIL_BIZ]);
});

describe("Gmail OAuth", () => {
  it("builds an offline consent URL with only the Gmail modify scope", () => {
    const url = new URL(
      buildGmailAuthorizationUrl({
        redirectUri: "https://backend.test/api/social/email/callback",
        state: "signed-state",
      })
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("test-gmail-client-id");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPES.join(" "));
  });

  it("exchanges an authorization code and surfaces provider failures", async () => {
    const ok = recorder(() =>
      jsonResponse({
        access_token: "short-token",
        refresh_token: "refresh-token",
        expires_in: 3599,
        scope: GMAIL_SCOPES.join(" "),
      })
    );
    const tokens = await exchangeGmailCode({
      code: "code-1",
      redirectUri: "https://backend.test/api/social/email/callback",
      fetchImpl: ok.fetchImpl,
    });
    expect(tokens.accessToken).toBe("short-token");
    expect(tokens.refreshToken).toBe("refresh-token");
    expect(tokens.expiresInSeconds).toBe(3599);

    const fail = recorder(() => jsonResponse({ error: "invalid_grant" }, 400));
    await expect(
      exchangeGmailCode({
        code: "bad",
        redirectUri: "https://backend.test/callback",
        fetchImpl: fail.fetchImpl,
      })
    ).rejects.toMatchObject({ code: "EMAIL_OAUTH_FAILED" });
  });

  it("stores encrypted tokens and marks the channel connected after the backend confirms access", async () => {
    const { fetchImpl } = recorder((url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return jsonResponse({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
          scope: GMAIL_SCOPES.join(" "),
        });
      }
      if (url.includes("/users/me/profile")) {
        return jsonResponse({ emailAddress: SUPPORT_ADDRESS, messagesTotal: 12 });
      }
      return jsonResponse({}, 404);
    });

    const result = await completeEmailConnection({
      businessId: EMAIL_BIZ,
      userId: (await prisma.business.findUniqueOrThrow({ where: { id: EMAIL_BIZ } })).ownerId,
      code: "code-1",
      redirectUri: "https://backend.test/api/social/email/callback",
      fetchImpl,
    });

    expect(result.emailAddress).toBe(SUPPORT_ADDRESS);
    expect(result.channel.status).toBe("CONNECTED");
    expect(result.channel.autoSend).toBe(true);

    const stored = readEmailConnection(result.channel.configJson);
    expect(stored?.refreshToken.startsWith("v1.")).toBe(true);
    expect(stored?.refreshToken).not.toContain("new-refresh");
    expect(decryptSecret(stored!.refreshToken)).toBe("new-refresh");

    const status = await getEmailStatus(EMAIL_BIZ);
    expect(status).toMatchObject({
      connected: true,
      status: "connected",
      emailAddress: SUPPORT_ADDRESS,
      autoSend: true,
      lastError: null,
    });
    expect(JSON.stringify(status)).not.toContain("new-refresh");
    expect(JSON.stringify(status)).not.toContain("new-access");
  });

  it("rejects a callback for a business the state user does not own", async () => {
    await expect(
      completeEmailConnection({
        businessId: EMAIL_BIZ,
        userId: "user_who_does_not_own_it",
        code: "code",
        redirectUri: "https://backend.test/callback",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Gmail tokens", () => {
  it("refreshes an expired access token and reuses the cached one", async () => {
    const channel = await seedGmailChannel({
      email: { accessToken: null, accessTokenExpiresAt: null },
    });
    const { fetchImpl, calls } = recorder(() =>
      jsonResponse({ access_token: "refreshed-token", expires_in: 3600 })
    );

    const first = await getValidGmailAccessToken(channel, fetchImpl);
    expect(first.accessToken).toBe("refreshed-token");
    expect(calls).toHaveLength(1);

    const second = await getValidGmailAccessToken(first.channel, fetchImpl);
    expect(second.accessToken).toBe("refreshed-token");
    expect(calls).toHaveLength(1);

    const reloaded = await prisma.channelConnection.findUniqueOrThrow({
      where: { businessId_channelType: { businessId: EMAIL_BIZ, channelType: "GMAIL" } },
    });
    const stored = readEmailConnection(reloaded.configJson);
    expect(decryptSecret(stored!.accessToken!)).toBe("refreshed-token");
  });

  it("clears credentials and restores the previous status when refresh is revoked", async () => {
    const channel = await seedGmailChannel({
      email: { accessToken: null, accessTokenExpiresAt: null },
    });
    const { fetchImpl } = recorder(() => jsonResponse({ error: "invalid_grant" }, 400));

    await expect(getValidGmailAccessToken(channel, fetchImpl)).rejects.toMatchObject({
      code: "EMAIL_RECONNECT_REQUIRED",
    });

    const reloaded = await prisma.channelConnection.findUniqueOrThrow({
      where: { businessId_channelType: { businessId: EMAIL_BIZ, channelType: "GMAIL" } },
    });
    expect(reloaded.status).toBe("DRAFT_ONLY");
    expect(reloaded.autoSend).toBe(false);
    expect(readEmailConnection(reloaded.configJson)).toBeNull();
    expect(reloaded.configJson).toContain("emailLastError");
    expect(reloaded.configJson).not.toContain("v1.");
  });
});

describe("Gmail sending", () => {
  it("builds MIME with thread headers and sends through the Gmail API", async () => {
    const channel = await seedGmailChannel();
    const { fetchImpl, calls } = recorder(() =>
      jsonResponse({ id: "sent_1", threadId: "thread_1" })
    );

    const result = await sendGmailMessage(
      channel,
      {
        to: "customer@example.com",
        subject: "Re: Pricing",
        text: "The Pro Plan costs ₹1,499 per month.",
        threadId: "thread_1",
        inReplyTo: "<inbound@mail.example.com>",
        references: "<root@mail.example.com> <inbound@mail.example.com>",
      },
      fetchImpl
    );

    expect(result).toMatchObject({ messageId: "sent_1", threadId: "thread_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/users/me/messages/send");

    const body = JSON.parse(String(calls[0].init?.body)) as { raw: string; threadId: string };
    expect(body.threadId).toBe("thread_1");
    const mime = Buffer.from(body.raw, "base64url").toString("utf8");
    expect(mime).toContain(`From: ${SUPPORT_ADDRESS}`);
    expect(mime).toContain("To: customer@example.com");
    expect(mime).toContain("In-Reply-To: <inbound@mail.example.com>");
    expect(mime).toContain("References: <root@mail.example.com> <inbound@mail.example.com>");
  });

  it("strips CRLF from header values so a subject cannot inject headers", () => {
    const raw = buildGmailRawMessage({
      from: SUPPORT_ADDRESS,
      to: "customer@example.com",
      subject: "Hello\r\nBcc: attacker@example.com",
      text: "Body",
    });
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).not.toContain("\r\nBcc:");
    expect(mime).toContain("Subject: Hello Bcc: attacker@example.com");
  });
});

describe("Gmail polling", () => {
  it("processes unread mail, replies in-thread, skips self-mail, and deduplicates", async () => {
    const channel = await seedGmailChannel();
    const { llm, calls: llmCalls } = groundedLlm();

    const outbound: Array<{ url: string; body: unknown }> = [];
    const { fetchImpl } = recorder((url, init) => {
      if (url.includes("/messages?") && url.includes("is%3Aunread")) {
        return jsonResponse({ messages: [{ id: "m1" }, { id: "m2" }] });
      }
      if (url.includes("/messages/m1?")) {
        return jsonResponse(
          gmailMessage({
            id: "m1",
            from: "Customer One <customer@example.com>",
            subject: "Pricing question",
            text: "How much does the Pro Plan cost?",
          })
        );
      }
      if (url.includes("/messages/m2?")) {
        return jsonResponse(
          gmailMessage({
            id: "m2",
            from: `Business <${SUPPORT_ADDRESS}>`,
            subject: "Our own newsletter",
            text: "This came from the business itself.",
          })
        );
      }
      if (url.includes("/messages/send")) {
        outbound.push({ url, body: JSON.parse(String(init?.body)) });
        return jsonResponse({ id: "sent_1", threadId: "thread_m1" });
      }
      if (url.includes("/messages/m1/modify")) {
        return jsonResponse({ id: "m1" });
      }
      return jsonResponse({}, 404);
    });

    const first = await pollGmailChannel(channel, { fetch: fetchImpl, llm });
    expect(first).toMatchObject({
      scanned: 2,
      processed: 1,
      duplicates: 0,
      skipped: 1,
      repliesSent: 1,
    });
    expect(llmCalls()).toBe(1);
    expect(outbound).toHaveLength(1);

    const mime = Buffer.from((outbound[0].body as { raw: string }).raw, "base64url").toString("utf8");
    expect(mime).toContain("To: customer@example.com");
    expect(mime).toContain("In-Reply-To: <m1@mail.example.com>");
    expect((outbound[0].body as { threadId?: string }).threadId).toBe("thread_m1");

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { externalMessageId: "gmail:m1" },
    });
    expect(ticket.businessId).toBe(EMAIL_BIZ);
    expect(ticket.channel).toBe("GMAIL");
    expect(ticket.customerHandle).toBe("customer@example.com");
    expect(ticket.aiDraftOrReply).toContain("₹1,499");

    const second = await pollGmailChannel(channel, { fetch: fetchImpl, llm });
    expect(second.duplicates).toBe(1);
    expect(second.repliesSent).toBe(0);
    expect(llmCalls()).toBe(1);
    expect(outbound).toHaveLength(1);
  });

  it("does not auto-send when the existing routing decision withholds a reply", async () => {
    const channel = await seedGmailChannel({ autoSend: false });
    const { fetchImpl } = recorder((url) => {
      if (url.includes("/messages?") && url.includes("is%3Aunread")) {
        return jsonResponse({ messages: [{ id: "m3" }] });
      }
      if (url.includes("/messages/m3?")) {
        return jsonResponse(
          gmailMessage({
            id: "m3",
            from: "Customer Three <customer3@example.com>",
            subject: "Question",
            text: "Can someone call me?",
          })
        );
      }
      return jsonResponse({});
    });

    const { llm } = groundedLlm();
    const summary = await pollGmailChannel(channel, { fetch: fetchImpl, llm });
    expect(summary.processed).toBe(1);
    expect(summary.repliesSent).toBe(0);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { externalMessageId: "gmail:m3" },
    });
    expect(ticket.actionStatus).not.toBe("answered");
  });
});

describe("email status and disconnect", () => {
  it("reports an error status recorded by a failed connection", async () => {
    await seedGmailChannel({
      status: "DRAFT_ONLY",
      autoSend: false,
      email: null,
      extraConfig: { emailLastError: "Google denied access." },
    });

    const status = await getEmailStatus(EMAIL_BIZ);
    expect(status).toMatchObject({
      connected: false,
      status: "error",
      emailAddress: null,
      lastError: "Google denied access.",
    });
  });

  it("revokes the token, clears credentials, and restores the previous channel mode", async () => {
    await seedGmailChannel();
    const { fetchImpl, calls } = recorder(() => new Response("", { status: 200 }));

    const channel = await disconnectEmail(EMAIL_BIZ, fetchImpl);
    expect(channel.status).toBe("DRAFT_ONLY");
    expect(channel.autoSend).toBe(false);
    expect(readEmailConnection(channel.configJson)).toBeNull();
    expect(channel.configJson).not.toContain("v1.");
    expect(calls[0].url).toContain("oauth2.googleapis.com/revoke");

    await expect(disconnectEmail(EMAIL_BIZ, fetchImpl)).rejects.toMatchObject({
      code: "EMAIL_NOT_CONNECTED",
    });
  });

  it("refuses to send or poll when the channel is not connected", async () => {
    const channel = await seedGmailChannel({ status: "DRAFT_ONLY", autoSend: false });
    await expect(
      sendGmailMessage(channel, {
        to: "customer@example.com",
        subject: "Hello",
        text: "Body",
      })
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONNECTED" });

    const summary = await pollGmailChannel(channel, { fetch: vi.fn() as unknown as EmailFetch });
    expect(summary.errors).toContain("EMAIL_NOT_CONNECTED");
  });
});

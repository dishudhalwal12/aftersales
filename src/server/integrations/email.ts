// Email integration (Gmail API). OAuth-only: the owner never types a mailbox
// password. Tokens are encrypted in ChannelConnection.configJson, sends go out
// as RFC 5322 MIME (with thread headers so replies stay in the thread), and
// incoming mail is polled because Gmail push needs a Google Cloud Pub/Sub
// setup that this hackathon deployment does not include.
//
// The provider boundary is deliberately small: adding Microsoft Graph or
// SendGrid later means a second implementation of connect/exchange/send/poll,
// not a change to the onboarding or triage pipeline.

import type { Business, ChannelConnection } from "@prisma/client";

import { respondToContact, type InboundContact, type RespondResult } from "../business/service.ts";
import { prisma } from "../db.ts";
import {
  ensureChannelConnection,
  isChannelStatus,
  readChannelConfig,
  recordIntegrationError,
  updateChannelConfig,
} from "./channels.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { IntegrationError } from "./errors.ts";

/** Inbound hand-off, injectable so tests can exercise the flow without the LLM. */
export type EmailRespond = (contact: InboundContact) => Promise<RespondResult>;

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"] as const;
export const EMAIL_CONFIG_KEY = "email";
export const EMAIL_ERROR_KEY = "emailLastError";
const ACCESS_TOKEN_SAFETY_MS = 120_000;
const DEFAULT_POLL_LIMIT = 10;

export type EmailFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type EmailProviderSettings = {
  provider: string;
  clientId: string;
  clientSecret: string;
  configured: boolean;
};

export function readEmailProviderSettings(): EmailProviderSettings {
  const provider = (process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "gmail");
  const clientId =
    process.env.EMAIL_GMAIL_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret =
    process.env.EMAIL_GMAIL_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "";

  return {
    provider,
    clientId,
    clientSecret,
    configured: provider === "gmail" && Boolean(clientId && clientSecret),
  };
}

export function isEmailProviderSupported(provider: string): provider is "gmail" {
  return provider === "gmail";
}

export type StoredEmailConnection = {
  provider: "gmail";
  emailAddress: string;
  accountId: string | null;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  scopes: string[];
  connectedAt: string;
  previousStatus: string | null;
  previousAutoSend: boolean | null;
};

export function readEmailConnection(configJson: string | null): StoredEmailConnection | null {
  const value = readChannelConfig(configJson)[EMAIL_CONFIG_KEY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const connection = value as Partial<StoredEmailConnection>;
  if (
    connection.provider !== "gmail" ||
    typeof connection.emailAddress !== "string" ||
    !connection.emailAddress.trim() ||
    typeof connection.refreshToken !== "string" ||
    !connection.refreshToken
  ) {
    return null;
  }

  return {
    provider: "gmail",
    emailAddress: connection.emailAddress,
    accountId: typeof connection.accountId === "string" ? connection.accountId : null,
    refreshToken: connection.refreshToken,
    accessToken: typeof connection.accessToken === "string" ? connection.accessToken : null,
    accessTokenExpiresAt:
      typeof connection.accessTokenExpiresAt === "string" ? connection.accessTokenExpiresAt : null,
    scopes: Array.isArray(connection.scopes)
      ? connection.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    connectedAt:
      typeof connection.connectedAt === "string" ? connection.connectedAt : new Date().toISOString(),
    previousStatus: typeof connection.previousStatus === "string" ? connection.previousStatus : null,
    previousAutoSend:
      typeof connection.previousAutoSend === "boolean" ? connection.previousAutoSend : null,
  };
}

export function buildGmailAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
}): string {
  const settings = readEmailProviderSettings();
  if (!settings.configured) {
    throw new IntegrationError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Gmail OAuth is not configured. Set EMAIL_GMAIL_CLIENT_ID and EMAIL_GMAIL_CLIENT_SECRET."
    );
  }

  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  // offline + consent is what actually returns a refresh token every time the
  // owner connects or reconnects (Google only sends it on first consent).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
  } catch {
    return {};
  }
}

function safeProviderError(json: JsonRecord): string | null {
  if (typeof json.error_description === "string") return json.error_description.slice(0, 300);
  const error = json.error;
  if (typeof error === "string") return error.slice(0, 300);
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 300);
  }
  return null;
}

function providerErrorCode(json: JsonRecord): number | null {
  const error = json.error;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

export type GmailTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scopes: string[];
};

export async function exchangeGmailCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: EmailFetch | undefined;
}): Promise<GmailTokenResult> {
  const settings = readEmailProviderSettings();
  if (!settings.configured) {
    throw new IntegrationError(503, "EMAIL_NOT_CONFIGURED", "Gmail OAuth is not configured.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: input.code,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await readJson(response);

  if (!response.ok || typeof json.access_token !== "string") {
    throw new IntegrationError(
      502,
      "EMAIL_OAUTH_FAILED",
      safeProviderError(json) ?? "Gmail rejected the authorization code."
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresInSeconds:
      typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600,
    scopes:
      typeof json.scope === "string" && json.scope.trim()
        ? json.scope.split(/\s+/)
        : [...GMAIL_SCOPES],
  };
}

export async function fetchGmailProfile(
  accessToken: string,
  fetchImpl: EmailFetch = fetch
): Promise<{ emailAddress: string; messagesTotal: number | null }> {
  const response = await fetchImpl(`${GMAIL_API_BASE}/users/me/profile`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = await readJson(response);

  if (!response.ok || typeof json.emailAddress !== "string") {
    throw new IntegrationError(
      502,
      "EMAIL_PROFILE_FAILED",
      safeProviderError(json) ?? "Gmail did not return the connected account profile."
    );
  }

  return {
    emailAddress: json.emailAddress,
    messagesTotal: typeof json.messagesTotal === "number" ? json.messagesTotal : null,
  };
}

function fallbackStatus(previousStatus: unknown): "UNAVAILABLE" | "TEST_MODE" | "DRAFT_ONLY" {
  return isChannelStatus(previousStatus) &&
    (previousStatus === "TEST_MODE" || previousStatus === "DRAFT_ONLY")
    ? previousStatus
    : "UNAVAILABLE";
}

export type CompleteEmailConnectionInput = {
  businessId: string;
  userId: string;
  code: string;
  redirectUri: string;
  fetchImpl?: EmailFetch | undefined;
};

export async function completeEmailConnection(
  input: CompleteEmailConnectionInput
): Promise<{ channel: ChannelConnection; emailAddress: string }> {
  // The state is signed, but ownership is re-read from the database so a
  // business transferred between owners cannot be connected by the old owner.
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, ownerId: input.userId },
    select: { id: true },
  });
  if (!business) {
    throw new IntegrationError(403, "FORBIDDEN", "You do not have access to this business.");
  }

  const channel = await ensureChannelConnection(input.businessId, "GMAIL");
  const existing = readEmailConnection(channel.configJson);
  const tokens = await exchangeGmailCode({
    code: input.code,
    redirectUri: input.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  const profile = await fetchGmailProfile(tokens.accessToken, input.fetchImpl ?? fetch);

  const refreshToken = tokens.refreshToken ?? (existing ? decryptSecret(existing.refreshToken) : null);
  if (!refreshToken) {
    throw new IntegrationError(
      400,
      "EMAIL_REFRESH_TOKEN_MISSING",
      "Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again."
    );
  }

  const now = new Date();
  const stored: StoredEmailConnection = {
    provider: "gmail",
    emailAddress: profile.emailAddress,
    accountId: profile.emailAddress,
    refreshToken: encryptSecret(refreshToken),
    accessToken: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: new Date(
      now.getTime() + tokens.expiresInSeconds * 1000
    ).toISOString(),
    scopes: tokens.scopes.length ? tokens.scopes : [...GMAIL_SCOPES],
    connectedAt: now.toISOString(),
    previousStatus:
      channel.status === "CONNECTED"
        ? existing?.previousStatus ?? null
        : isChannelStatus(channel.status)
          ? channel.status
          : null,
    previousAutoSend:
      channel.status === "CONNECTED"
        ? existing?.previousAutoSend ?? null
        : channel.autoSend,
  };

  const updated = await updateChannelConfig(channel, {
    config: { [EMAIL_CONFIG_KEY]: stored, [EMAIL_ERROR_KEY]: null },
    status: "CONNECTED",
    autoSend: true,
  });

  return { channel: updated, emailAddress: profile.emailAddress };
}

async function markEmailReconnectRequired(
  channel: ChannelConnection,
  message: string
): Promise<ChannelConnection> {
  const connection = readEmailConnection(channel.configJson);
  return updateChannelConfig(channel, {
    config: {
      [EMAIL_CONFIG_KEY]: null,
      [EMAIL_ERROR_KEY]: message.slice(0, 500),
    },
    status: fallbackStatus(connection?.previousStatus),
    autoSend: connection?.previousAutoSend ?? false,
  });
}

export async function getValidGmailAccessToken(
  channel: ChannelConnection,
  fetchImpl: EmailFetch = fetch
): Promise<{ accessToken: string; channel: ChannelConnection }> {
  const connection = readEmailConnection(channel.configJson);
  if (!connection || channel.status !== "CONNECTED") {
    throw new IntegrationError(409, "EMAIL_NOT_CONNECTED", "Connect an email account before using this channel.");
  }

  const expiresAt = connection.accessTokenExpiresAt
    ? Date.parse(connection.accessTokenExpiresAt)
    : 0;
  if (
    connection.accessToken &&
    Number.isFinite(expiresAt) &&
    expiresAt - ACCESS_TOKEN_SAFETY_MS > Date.now()
  ) {
    return { accessToken: decryptSecret(connection.accessToken), channel };
  }

  const settings = readEmailProviderSettings();
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    refresh_token: decryptSecret(connection.refreshToken),
    grant_type: "refresh_token",
  });

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await readJson(response);

  if (!response.ok || typeof json.access_token !== "string") {
    const errorCode = typeof json.error === "string" ? json.error : "";
    if (errorCode === "invalid_grant" || response.status === 400 || response.status === 401) {
      await markEmailReconnectRequired(
        channel,
        "Gmail authorization expired or was revoked. Reconnect the email channel."
      );
      throw new IntegrationError(
        401,
        "EMAIL_RECONNECT_REQUIRED",
        "Gmail authorization expired or was revoked. Reconnect the email channel."
      );
    }
    throw new IntegrationError(
      502,
      "EMAIL_TOKEN_REFRESH_FAILED",
      safeProviderError(json) ?? "Gmail token refresh failed."
    );
  }

  const expiresIn =
    typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  const updated = await updateChannelConfig(channel, {
    config: {
      [EMAIL_CONFIG_KEY]: {
        ...connection,
        accessToken: encryptSecret(json.access_token),
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      } satisfies StoredEmailConnection,
      [EMAIL_ERROR_KEY]: null,
    },
  });

  return { accessToken: json.access_token, channel: updated };
}

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");
}

export type OutboundEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null | undefined;
  references?: string | null | undefined;
};

export function buildGmailRawMessage(input: OutboundEmail): string {
  const headers = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    `Subject: ${sanitizeHeaderValue(input.subject)}`,
  ];

  if (input.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeaderValue(input.inReplyTo)}`);
  if (input.references) headers.push(`References: ${sanitizeHeaderValue(input.references)}`);

  headers.push(
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.text, "utf8").toString("base64"))
  );

  return Buffer.from(headers.join("\r\n"), "utf8").toString("base64url");
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  threadId?: string | null | undefined;
  inReplyTo?: string | null | undefined;
  references?: string | null | undefined;
};

export async function sendGmailMessage(
  channel: ChannelConnection,
  input: SendEmailInput,
  fetchImpl: EmailFetch = fetch
): Promise<{ messageId: string; threadId: string | null; channel: ChannelConnection }> {
  const connection = readEmailConnection(channel.configJson);
  if (!connection) {
    throw new IntegrationError(409, "EMAIL_NOT_CONNECTED", "Connect an email account before sending mail.");
  }

  const { accessToken, channel: freshChannel } = await getValidGmailAccessToken(channel, fetchImpl);
  const raw = buildGmailRawMessage({
    from: connection.emailAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  const response = await fetchImpl(`${GMAIL_API_BASE}/users/me/messages/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  });
  const json = await readJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      await markEmailReconnectRequired(
        freshChannel,
        "Gmail rejected the access token. Reconnect the email channel."
      );
      throw new IntegrationError(
        401,
        "EMAIL_RECONNECT_REQUIRED",
        "Gmail rejected the access token. Reconnect the email channel."
      );
    }
    throw new IntegrationError(
      502,
      "EMAIL_SEND_FAILED",
      safeProviderError(json) ?? "Gmail did not accept the message."
    );
  }

  if (typeof json.id !== "string") {
    throw new IntegrationError(502, "EMAIL_SEND_FAILED", "Gmail did not return a message id.");
  }

  return {
    messageId: json.id,
    threadId: typeof json.threadId === "string" ? json.threadId : null,
    channel: freshChannel,
  };
}

export async function sendEmailForBusiness(
  businessId: string,
  input: SendEmailInput,
  fetchImpl: EmailFetch = fetch
): Promise<{ messageId: string; threadId: string | null }> {
  const channel = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId, channelType: "GMAIL" } },
  });
  if (!channel || channel.status !== "CONNECTED" || !readEmailConnection(channel.configJson)) {
    throw new IntegrationError(409, "EMAIL_NOT_CONNECTED", "Connect an email account before sending mail.");
  }

  const result = await sendGmailMessage(channel, input, fetchImpl);
  return { messageId: result.messageId, threadId: result.threadId };
}

export async function disconnectEmail(
  businessId: string,
  fetchImpl: EmailFetch = fetch
): Promise<ChannelConnection> {
  const channel = await ensureChannelConnection(businessId, "GMAIL");
  const connection = readEmailConnection(channel.configJson);
  if (!connection) {
    throw new IntegrationError(404, "EMAIL_NOT_CONNECTED", "No email account is connected for this business.");
  }

  // Best effort: revoking is recommended, but a revoke failure must not leave
  // the credentials sitting in the database after the owner asked to disconnect.
  try {
    const refreshToken = decryptSecret(connection.refreshToken);
    await fetchImpl(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
  } catch (error) {
    console.warn("[email] token revoke failed during disconnect", {
      businessId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return updateChannelConfig(channel, {
    config: { [EMAIL_CONFIG_KEY]: null, [EMAIL_ERROR_KEY]: null },
    status: fallbackStatus(connection.previousStatus),
    autoSend: connection.previousAutoSend ?? false,
  });
}

export type EmailStatus = {
  provider: string;
  configured: boolean;
  connected: boolean;
  status: "connected" | "disconnected" | "error";
  emailAddress: string | null;
  connectedAt: string | null;
  scopes: string[];
  autoSend: boolean;
  lastError: string | null;
};

export async function getEmailStatus(businessId: string): Promise<EmailStatus> {
  const settings = readEmailProviderSettings();
  const channel = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId, channelType: "GMAIL" } },
  });
  const connection = channel ? readEmailConnection(channel.configJson) : null;
  const config = channel ? readChannelConfig(channel.configJson) : {};
  const lastError =
    typeof config[EMAIL_ERROR_KEY] === "string" ? (config[EMAIL_ERROR_KEY] as string) : null;
  const connected = Boolean(channel && connection && channel.status === "CONNECTED");

  return {
    provider: settings.provider,
    configured: settings.configured,
    connected,
    status: connected ? "connected" : lastError ? "error" : "disconnected",
    emailAddress: connection?.emailAddress ?? null,
    connectedAt: connection?.connectedAt ?? null,
    scopes: connection?.scopes ?? [],
    autoSend: channel?.autoSend ?? false,
    lastError,
  };
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type GmailMessagePayload = {
  id: string;
  threadId: string;
  labelIds?: string[] | undefined;
  snippet?: string | undefined;
  payload?: GmailPart | undefined;
};

function decodeBase64Url(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export function readGmailHeader(headers: GmailHeader[] | undefined, name: string): string {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return match?.value?.trim() ?? "";
}

function extractPlainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (
    part.mimeType === "text/plain" &&
    part.body?.data &&
    (!part.filename || part.filename.length === 0)
  ) {
    return decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text.trim()) return text;
  }

  return "";
}

export function parseEmailAddress(value: string): { email: string; name: string } {
  const angle = value.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? value).trim().toLowerCase();
  const name = angle ? value.replace(angle[0], "").replace(/^"|"$/g, "").trim() : "";
  return { email, name };
}

export type GmailInboundOutcome = {
  messageId: string;
  duplicate: boolean;
  ticketId: string;
  replySent: boolean;
  replyError: string | null;
  skipped: string | null;
};

async function markGmailMessageRead(
  channel: ChannelConnection,
  messageId: string,
  fetchImpl: EmailFetch
): Promise<void> {
  try {
    const { accessToken } = await getValidGmailAccessToken(channel, fetchImpl);
    await fetchImpl(
      `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}/modify`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }
    );
  } catch (error) {
    console.warn("[email] could not mark a polled message as read", {
      messageId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export type EmailPollDependencies = {
  fetch?: EmailFetch;
  respond?: EmailRespond;
  maxResults?: number;
};

export async function processGmailMessage(
  channel: ChannelConnection,
  business: Business,
  message: GmailMessagePayload,
  deps: EmailPollDependencies = {}
): Promise<GmailInboundOutcome> {
  const fetchImpl = deps.fetch ?? fetch;
  const connection = readEmailConnection(channel.configJson);
  if (!connection) {
    throw new IntegrationError(409, "EMAIL_NOT_CONNECTED", "Connect an email account before polling mail.");
  }

  const headers = message.payload?.headers;
  const from = readGmailHeader(headers, "From");
  const sender = parseEmailAddress(from);
  const subject = readGmailHeader(headers, "Subject");
  const providerMessageIdHeader = readGmailHeader(headers, "Message-ID");
  const references = readGmailHeader(headers, "References");
  const text = extractPlainText(message.payload).trim() || (message.snippet ?? "").trim();

  const base = {
    messageId: message.id,
    duplicate: false,
    ticketId: "",
    replySent: false,
    replyError: null,
    skipped: null,
  };

  // Gmail search already excludes -from:me, but an alias can still slip
  // through; never let the agent answer the business's own address.
  if (
    !sender.email ||
    sender.email === connection.emailAddress.toLowerCase() ||
    message.labelIds?.includes("SENT")
  ) {
    return { ...base, skipped: "self_authored" };
  }

  if (!text) {
    return { ...base, skipped: "empty_body" };
  }

  const outcome = await (deps.respond ?? respondToContact)({
    business,
    channel: "GMAIL",
    externalMessageId: `gmail:${message.id}`,
    customerName: sender.name || sender.email,
    customerHandle: sender.email,
    query: text,
  });

  let replySent = false;
  let replyError: string | null = null;

  if (!outcome.duplicate && outcome.shouldAutoSend && outcome.answer.trim()) {
    try {
      await sendGmailMessage(
        channel,
        {
          to: sender.email,
          subject: subject.toLowerCase().startsWith("re:")
            ? subject
            : `Re: ${subject || "Your message"}`,
          text: outcome.answer,
          threadId: message.threadId,
          inReplyTo: providerMessageIdHeader || null,
          references: [references, providerMessageIdHeader].filter(Boolean).join(" ") || null,
        },
        fetchImpl
      );
      replySent = true;
    } catch (error) {
      replyError = error instanceof IntegrationError ? error.reason : "EMAIL_SEND_FAILED";
      console.error("[email] auto-reply failed", {
        businessId: business.id,
        ticketId: outcome.ticketId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  // Mark read even when the reply failed: the ticket already exists, so a
  // later poll would be treated as a duplicate and could never resend anyway.
  await markGmailMessageRead(channel, message.id, fetchImpl);

  return {
    messageId: message.id,
    duplicate: outcome.duplicate,
    ticketId: outcome.ticketId,
    replySent,
    replyError,
    skipped: null,
  };
}

export type EmailPollSummary = {
  businessId: string;
  emailAddress: string | null;
  scanned: number;
  processed: number;
  duplicates: number;
  skipped: number;
  repliesSent: number;
  errors: string[];
};

export async function pollGmailChannel(
  channel: ChannelConnection,
  deps: EmailPollDependencies = {}
): Promise<EmailPollSummary> {
  const fetchImpl = deps.fetch ?? fetch;
  const connection = readEmailConnection(channel.configJson);
  const summary: EmailPollSummary = {
    businessId: channel.businessId,
    emailAddress: connection?.emailAddress ?? null,
    scanned: 0,
    processed: 0,
    duplicates: 0,
    skipped: 0,
    repliesSent: 0,
    errors: [],
  };

  if (!connection || channel.status !== "CONNECTED") {
    summary.errors.push("EMAIL_NOT_CONNECTED");
    return summary;
  }

  const business = await prisma.business.findUnique({ where: { id: channel.businessId } });
  if (!business) {
    summary.errors.push("BUSINESS_NOT_FOUND");
    return summary;
  }

  const { accessToken, channel: freshChannel } = await getValidGmailAccessToken(channel, fetchImpl);
  const limit = deps.maxResults ?? DEFAULT_POLL_LIMIT;
  const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  listUrl.searchParams.set("q", "is:unread -from:me -in:chats");
  listUrl.searchParams.set("maxResults", String(limit));

  const listResponse = await fetchImpl(listUrl.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const listJson = await readJson(listResponse);

  if (!listResponse.ok) {
    if (listResponse.status === 401) {
      await markEmailReconnectRequired(
        freshChannel,
        "Gmail rejected the access token while polling. Reconnect the email channel."
      );
      summary.errors.push("EMAIL_RECONNECT_REQUIRED");
      return summary;
    }
    summary.errors.push(safeProviderError(listJson) ?? "EMAIL_LIST_FAILED");
    return summary;
  }

  const messages = Array.isArray(listJson.messages) ? listJson.messages : [];
  for (const entry of messages) {
    const id =
      typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string"
        ? (entry as { id: string }).id
        : null;
    if (!id) continue;

    summary.scanned += 1;
    try {
      const detailResponse = await fetchImpl(
        `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`,
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      const detail = await readJson(detailResponse);
      if (!detailResponse.ok || typeof detail.id !== "string") {
        summary.errors.push(safeProviderError(detail) ?? "EMAIL_FETCH_FAILED");
        continue;
      }

      const payload: GmailMessagePayload = {
        id: detail.id,
        threadId: typeof detail.threadId === "string" ? detail.threadId : "",
        labelIds: Array.isArray(detail.labelIds)
          ? detail.labelIds.filter((label): label is string => typeof label === "string")
          : undefined,
        snippet: typeof detail.snippet === "string" ? detail.snippet : undefined,
        payload: detail.payload as GmailPart | undefined,
      };

      const result = await processGmailMessage(freshChannel, business, payload, deps);
      if (result.skipped) summary.skipped += 1;
      else if (result.duplicate) summary.duplicates += 1;
      else summary.processed += 1;
      if (result.replySent) summary.repliesSent += 1;
      if (result.replyError) summary.errors.push(result.replyError);
    } catch (error) {
      summary.errors.push(error instanceof IntegrationError ? error.reason : "EMAIL_PROCESS_FAILED");
      console.error("[email] poll processing failed", {
        businessId: channel.businessId,
        messageId: id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return summary;
}

export async function pollConnectedEmailInboxes(
  deps: EmailPollDependencies = {}
): Promise<{ businesses: EmailPollSummary[] }> {
  const channels = await prisma.channelConnection.findMany({
    where: { channelType: "GMAIL", status: "CONNECTED" },
    orderBy: { businessId: "asc" },
  });

  const summaries: EmailPollSummary[] = [];
  for (const channel of channels) {
    if (!readEmailConnection(channel.configJson)) continue;
    try {
      summaries.push(await pollGmailChannel(channel, deps));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email poll failed.";
      summaries.push({
        businessId: channel.businessId,
        emailAddress: readEmailConnection(channel.configJson)?.emailAddress ?? null,
        scanned: 0,
        processed: 0,
        duplicates: 0,
        skipped: 0,
        repliesSent: 0,
        errors: [error instanceof IntegrationError ? error.reason : "EMAIL_POLL_FAILED"],
      });
      await recordIntegrationError(channel.businessId, "GMAIL", EMAIL_ERROR_KEY, message);
      console.error("[email] business poll failed", {
        businessId: channel.businessId,
        error: message,
      });
    }
  }

  return { businesses: summaries };
}

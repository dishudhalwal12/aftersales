// Instagram integration built on "Instagram API with Instagram Login".
//
// This path deliberately does not use Facebook Login or Page tokens:
//   - authorization:  https://www.instagram.com/oauth/authorize
//   - first exchange: POST https://api.instagram.com/oauth/access_token
//   - 60-day token:   GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token
//   - API calls:      https://graph.instagram.com/{version}/...
//
// One connected row per business (ChannelConnection, type INSTAGRAM). The token
// is encrypted with the same vault as every other provider credential and its
// 60-day expiry is mirrored into an indexed column for the dashboard.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Business, ChannelConnection } from "@prisma/client";

import { respondToContact, type InboundContact, type RespondResult } from "../business/service.ts";
import { prisma } from "../db.ts";
import {
  ensureChannelConnection,
  isChannelStatus,
  readChannelConfig,
} from "./channels.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { IntegrationError } from "./errors.ts";

export type InstagramFetch = (input: string, init?: RequestInit) => Promise<Response>;

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE = "https://graph.instagram.com";
const DEFAULT_GRAPH_VERSION = "v21.0";
const LONG_LIVED_FALLBACK_SECONDS = 60 * 24 * 60 * 60;

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

export const INSTAGRAM_CONNECTION_KEY = "instagramConnection";
export const INSTAGRAM_ERROR_KEY = "instagramLastError";

export type InstagramSettings = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  verifyToken: string;
  graphVersion: string;
  configured: boolean;
};

export function readInstagramSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): InstagramSettings {
  const appId = (env["INSTAGRAM_APP_ID"] ?? "").trim();
  const appSecret = (env["INSTAGRAM_APP_SECRET"] ?? "").trim();
  const requestedVersion = (env["INSTAGRAM_GRAPH_VERSION"] ?? "").trim();
  const graphVersion = /^v\d+\.\d+$/.test(requestedVersion)
    ? requestedVersion
    : DEFAULT_GRAPH_VERSION;

  return {
    appId,
    appSecret,
    redirectUri: (env["INSTAGRAM_REDIRECT_URI"] ?? "").trim(),
    verifyToken: (env["INSTAGRAM_WEBHOOK_VERIFY_TOKEN"] ?? "").trim(),
    graphVersion,
    configured: Boolean(appId && appSecret),
  };
}

export function isInstagramConfigured(): boolean {
  return readInstagramSettings().configured;
}

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${readInstagramSettings().graphVersion}/${path}`;
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

function safeError(json: JsonRecord): string | null {
  const error = json.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 300);
  }
  if (typeof error === "string") return error.slice(0, 300);
  if (typeof json.error_message === "string") return json.error_message.slice(0, 300);
  if (typeof json.error_description === "string") return json.error_description.slice(0, 300);
  return null;
}

function errorCode(json: JsonRecord): number | null {
  const error = json.error;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Authorization and tokens
// ---------------------------------------------------------------------------

export function buildInstagramAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
}): string {
  const settings = readInstagramSettings();
  if (!settings.configured) {
    throw new IntegrationError(
      503,
      "INSTAGRAM_NOT_CONFIGURED",
      "Instagram Login is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.",
    );
  }

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type InstagramTokenResult = {
  accessToken: string;
  userId: string;
  expiresInSeconds: number;
};

function readShortLivedToken(json: JsonRecord): { accessToken: string; userId: string } | null {
  // Instagram has returned both a flat object and `{ data: [ ... ] }`.
  const candidate = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : json;
  if (typeof candidate !== "object" || candidate === null) return null;
  const record = candidate as { access_token?: unknown; user_id?: unknown };
  if (typeof record.access_token !== "string" || !record.access_token) return null;
  const userId =
    typeof record.user_id === "string"
      ? record.user_id
      : typeof record.user_id === "number"
        ? String(record.user_id)
        : "";
  if (!userId) return null;
  return { accessToken: record.access_token, userId };
}

/**
 * Step A + B: code -> short-lived token -> 60-day token.
 *
 * The long-lived exchange is fatal when it fails: saving an hour-long token
 * would look connected and then break silently, so the owner is asked to retry.
 */
export async function exchangeInstagramCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: InstagramFetch | undefined;
}): Promise<InstagramTokenResult> {
  const settings = readInstagramSettings();
  if (!settings.configured) {
    throw new IntegrationError(503, "INSTAGRAM_NOT_CONFIGURED", "Instagram Login is not configured.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: settings.appId,
    client_secret: settings.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  const shortResponse = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const shortJson = await readJson(shortResponse);
  const short = readShortLivedToken(shortJson);
  if (!shortResponse.ok || short === null) {
    throw new IntegrationError(
      502,
      "INSTAGRAM_OAUTH_FAILED",
      safeError(shortJson) ?? "Instagram rejected the authorization code.",
    );
  }

  const longUrl = new URL(`${GRAPH_BASE}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", settings.appSecret);
  longUrl.searchParams.set("access_token", short.accessToken);

  const longResponse = await fetchImpl(longUrl.toString());
  const longJson = await readJson(longResponse);
  if (!longResponse.ok || typeof longJson.access_token !== "string") {
    throw new IntegrationError(
      502,
      "INSTAGRAM_TOKEN_EXCHANGE_FAILED",
      safeError(longJson) ?? "Instagram did not return a long-lived access token.",
    );
  }

  const expiresInSeconds =
    typeof longJson.expires_in === "number" && longJson.expires_in > 0
      ? longJson.expires_in
      : LONG_LIVED_FALLBACK_SECONDS;

  return { accessToken: longJson.access_token, userId: short.userId, expiresInSeconds };
}

/** Step C: subscribe this account to comments and messages webhooks. */
export async function subscribeInstagramAccount(
  accountId: string,
  accessToken: string,
  fetchImpl: InstagramFetch = fetch,
): Promise<void> {
  const url = new URL(graphUrl(`${encodeURIComponent(accountId)}/subscribed_apps`));
  url.searchParams.set("subscribed_fields", "comments,messages");

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = await readJson(response);
  if (!response.ok || json.success === false) {
    throw new IntegrationError(
      502,
      "INSTAGRAM_SUBSCRIBE_FAILED",
      safeError(json) ?? "Instagram did not accept the webhook subscription.",
    );
  }
}

export type InstagramProfile = { username: string | null; name: string | null };

/** Display-only profile lookup; a failure here must not undo a valid token. */
export async function fetchInstagramProfile(
  accountId: string,
  accessToken: string,
  fetchImpl: InstagramFetch = fetch,
): Promise<InstagramProfile> {
  try {
    const url = new URL(graphUrl("me"));
    url.searchParams.set("fields", "user_id,username,name");
    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok) return { username: null, name: null };
    return {
      username: typeof json.username === "string" ? json.username : null,
      name: typeof json.name === "string" ? json.name : null,
    };
  } catch {
    return { username: null, name: null };
  }
}

// ---------------------------------------------------------------------------
// Stored connection
// ---------------------------------------------------------------------------

export type InstagramConnection = {
  accountId: string;
  username: string | null;
  name: string | null;
  token: string;
  scopes: string[];
  graphVersion: string;
  connectedAt: string;
  tokenExpiresAt: string;
  previousStatus: string | null;
  previousAutoSend: boolean | null;
};

export function readInstagramConnection(configJson: string | null): InstagramConnection | null {
  const value = readChannelConfig(configJson)[INSTAGRAM_CONNECTION_KEY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const connection = value as Partial<InstagramConnection>;
  if (
    typeof connection.accountId !== "string" ||
    !connection.accountId ||
    typeof connection.token !== "string" ||
    !connection.token
  ) {
    return null;
  }

  return {
    accountId: connection.accountId,
    username: typeof connection.username === "string" ? connection.username : null,
    name: typeof connection.name === "string" ? connection.name : null,
    token: connection.token,
    scopes: Array.isArray(connection.scopes)
      ? connection.scopes.filter((scope): scope is string => typeof scope === "string")
      : [...INSTAGRAM_SCOPES],
    graphVersion:
      typeof connection.graphVersion === "string"
        ? connection.graphVersion
        : readInstagramSettings().graphVersion,
    connectedAt:
      typeof connection.connectedAt === "string" ? connection.connectedAt : new Date().toISOString(),
    tokenExpiresAt: typeof connection.tokenExpiresAt === "string" ? connection.tokenExpiresAt : "",
    previousStatus: typeof connection.previousStatus === "string" ? connection.previousStatus : null,
    previousAutoSend:
      typeof connection.previousAutoSend === "boolean" ? connection.previousAutoSend : null,
  };
}

function fallbackStatus(previous: unknown): "UNAVAILABLE" | "TEST_MODE" | "DRAFT_ONLY" {
  return isChannelStatus(previous) && (previous === "TEST_MODE" || previous === "DRAFT_ONLY")
    ? previous
    : "UNAVAILABLE";
}

export type InstagramChannelSummary = {
  connected: boolean;
  status: "connected" | "expired" | "error" | "disconnected";
  accountId: string | null;
  username: string | null;
  name: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
};

export function summarizeInstagramChannel(
  channel: ChannelConnection | null,
  now: number = Date.now(),
): InstagramChannelSummary {
  const config = channel ? readChannelConfig(channel.configJson) : {};
  const connection = channel ? readInstagramConnection(channel.configJson) : null;
  const lastError =
    typeof config[INSTAGRAM_ERROR_KEY] === "string" ? (config[INSTAGRAM_ERROR_KEY] as string) : null;
  const expiresAt = channel?.tokenExpiresAt?.toISOString() ?? connection?.tokenExpiresAt ?? null;
  const expired = expiresAt !== null && expiresAt.length > 0 && Date.parse(expiresAt) <= now;
  const connected = Boolean(channel && connection && channel.status === "CONNECTED" && !expired);

  return {
    connected,
    status: connected
      ? "connected"
      : expired
        ? "expired"
        : lastError
          ? "error"
          : "disconnected",
    accountId: connection?.accountId ?? null,
    username: connection?.username ?? null,
    name: connection?.name ?? null,
    connectedAt: connection?.connectedAt ?? null,
    tokenExpiresAt: expiresAt,
    lastError: expired ? "The Instagram token expired. Reconnect Instagram." : lastError,
  };
}

export async function saveInstagramConnection(input: {
  businessId: string;
  userId: string;
  accountId: string;
  username: string | null;
  name: string | null;
  accessToken: string;
  expiresInSeconds: number;
  previousStatus?: string | null;
  previousAutoSend?: boolean | null;
}): Promise<ChannelConnection> {
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, ownerId: input.userId },
    select: { id: true },
  });
  if (!business) {
    throw new IntegrationError(403, "FORBIDDEN", "You do not have access to this business.");
  }

  const channel = await ensureChannelConnection(input.businessId, "INSTAGRAM");
  const existing = readInstagramConnection(channel.configJson);
  const connectedAt = new Date();
  const tokenExpiresAt = new Date(connectedAt.getTime() + input.expiresInSeconds * 1000);

  const connection: InstagramConnection = {
    accountId: input.accountId,
    username: input.username,
    name: input.name,
    token: encryptSecret(input.accessToken),
    scopes: [...INSTAGRAM_SCOPES],
    graphVersion: readInstagramSettings().graphVersion,
    connectedAt: connectedAt.toISOString(),
    tokenExpiresAt: tokenExpiresAt.toISOString(),
    previousStatus:
      channel.status === "CONNECTED"
        ? existing?.previousStatus ?? null
        : isChannelStatus(channel.status)
          ? channel.status
          : null,
    previousAutoSend:
      channel.status === "CONNECTED" ? existing?.previousAutoSend ?? null : channel.autoSend,
  };

  const config = { ...readChannelConfig(channel.configJson) };
  config[INSTAGRAM_CONNECTION_KEY] = connection;
  config[INSTAGRAM_ERROR_KEY] = null;
  // The old Facebook-linked Instagram shape must not survive alongside this one.
  config["metaConnection"] = null;

  return prisma.channelConnection.update({
    where: { id: channel.id },
    data: {
      configJson: JSON.stringify(config),
      externalAccountId: input.accountId,
      tokenExpiresAt,
      status: "CONNECTED",
      autoSend: true,
    },
  });
}

async function markInstagramReconnectRequired(
  channel: ChannelConnection,
  message: string,
): Promise<void> {
  const connection = readInstagramConnection(channel.configJson);
  const config = { ...readChannelConfig(channel.configJson) };
  config[INSTAGRAM_CONNECTION_KEY] = null;
  config[INSTAGRAM_ERROR_KEY] = message.slice(0, 500);

  await prisma.channelConnection.update({
    where: { id: channel.id },
    data: {
      configJson: JSON.stringify(config),
      externalAccountId: null,
      tokenExpiresAt: null,
      status: fallbackStatus(connection?.previousStatus),
      autoSend: connection?.previousAutoSend ?? false,
    },
  });
}

function requireConnection(channel: ChannelConnection): InstagramConnection {
  const connection = readInstagramConnection(channel.configJson);
  if (!connection || channel.status !== "CONNECTED") {
    throw new IntegrationError(
      409,
      "INSTAGRAM_NOT_CONNECTED",
      "Connect Instagram through the dashboard before replying.",
    );
  }
  return connection;
}

async function handleGraphFailure(
  channel: ChannelConnection,
  json: JsonRecord,
  fallbackMessage: string,
): Promise<never> {
  if (errorCode(json) === 190) {
    const message = "Instagram rejected the access token. Reconnect Instagram.";
    await markInstagramReconnectRequired(channel, message);
    throw new IntegrationError(401, "INSTAGRAM_RECONNECT_REQUIRED", message);
  }
  throw new IntegrationError(502, "INSTAGRAM_SEND_FAILED", safeError(json) ?? fallbackMessage);
}

/** Step 6 (DM): POST /me/messages with the Instagram token. */
export async function sendInstagramDm(
  channel: ChannelConnection,
  recipientId: string,
  text: string,
  fetchImpl: InstagramFetch = fetch,
): Promise<{ messageId: string }> {
  const connection = requireConnection(channel);
  const response = await fetchImpl(graphUrl("me/messages"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${decryptSecret(connection.token)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: text.slice(0, 1000) },
    }),
  });
  const json = await readJson(response);
  if (!response.ok) {
    await handleGraphFailure(channel, json, "Instagram did not accept the message.");
  }

  const messageId =
    typeof json.message_id === "string" ? json.message_id : `instagram_sent_${Date.now()}`;
  return { messageId };
}

/** Step 6 (comment): POST /{comment-id}/replies with the Instagram token. */
export async function replyToInstagramComment(
  channel: ChannelConnection,
  commentId: string,
  text: string,
  fetchImpl: InstagramFetch = fetch,
): Promise<{ replyId: string }> {
  const connection = requireConnection(channel);
  const response = await fetchImpl(
    graphUrl(`${encodeURIComponent(commentId)}/replies`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${decryptSecret(connection.token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: text.slice(0, 1000) }),
    },
  );
  const json = await readJson(response);
  if (!response.ok) {
    await handleGraphFailure(channel, json, "Instagram did not accept the comment reply.");
  }

  const replyId = typeof json.id === "string" ? json.id : `instagram_reply_${Date.now()}`;
  return { replyId };
}

export async function sendInstagramForBusiness(input: {
  businessId: string;
  recipientId: string;
  text: string;
  fetchImpl?: InstagramFetch | undefined;
}): Promise<{ messageId: string; provider: "INSTAGRAM" }> {
  const channel = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId: input.businessId, channelType: "INSTAGRAM" } },
  });
  if (!channel) {
    throw new IntegrationError(409, "INSTAGRAM_NOT_CONNECTED", "Connect Instagram first.");
  }
  const result = await sendInstagramDm(channel, input.recipientId, input.text, input.fetchImpl ?? fetch);
  return { ...result, provider: "INSTAGRAM" };
}

export async function getInstagramStatus(businessId: string): Promise<{
  businessId: string;
  configured: boolean;
  webhookConfigured: boolean;
  instagram: InstagramChannelSummary;
}> {
  const channel = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId, channelType: "INSTAGRAM" } },
  });
  const settings = readInstagramSettings();
  return {
    businessId,
    configured: settings.configured,
    webhookConfigured: settings.verifyToken.length > 0,
    instagram: summarizeInstagramChannel(channel),
  };
}

export type DisconnectInstagramResult = {
  instagram: InstagramChannelSummary;
};

export async function disconnectInstagram(input: {
  businessId: string;
  fetchImpl?: InstagramFetch | undefined;
}): Promise<DisconnectInstagramResult> {
  const channel = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId: input.businessId, channelType: "INSTAGRAM" } },
  });
  if (!channel) return { instagram: summarizeInstagramChannel(null) };

  const connection = readInstagramConnection(channel.configJson);
  if (connection) {
    try {
      await (input.fetchImpl ?? fetch)(
        graphUrl(`${encodeURIComponent(connection.accountId)}/subscribed_apps`),
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${decryptSecret(connection.token)}` },
        },
      );
    } catch (error) {
      console.warn("[instagram] could not unsubscribe during disconnect", {
        businessId: input.businessId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const config = { ...readChannelConfig(channel.configJson) };
  config[INSTAGRAM_CONNECTION_KEY] = null;
  config[INSTAGRAM_ERROR_KEY] = null;

  const updated = await prisma.channelConnection.update({
    where: { id: channel.id },
    data: {
      configJson: JSON.stringify(config),
      externalAccountId: null,
      tokenExpiresAt: null,
      status: fallbackStatus(connection?.previousStatus),
      autoSend: connection?.previousAutoSend ?? false,
    },
  });

  return { instagram: summarizeInstagramChannel(updated) };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function verifyInstagramSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.toLowerCase().startsWith("sha256=") || !appSecret) {
    return false;
  }
  const providedHex = signatureHeader.slice("sha256=".length).trim();
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(providedHex, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function verifyInstagramChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string;
}): string | null {
  if (!input.expectedToken) return null;
  if (input.mode !== "subscribe" || !input.token || !input.challenge) return null;

  const expected = Buffer.from(input.expectedToken, "utf8");
  const provided = Buffer.from(input.token, "utf8");
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? input.challenge : null;
}

export type InstagramCommentValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
  parent_id?: string;
};

export type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string };
    }>;
    changes?: Array<{ field?: string; value?: InstagramCommentValue }>;
  }>;
};

export type InstagramWebhookSummary = {
  received: number;
  processed: number;
  duplicates: number;
  ignored: number;
  repliesSent: number;
  errors: number;
};

export type InstagramRespond = (contact: InboundContact) => Promise<RespondResult>;

type InstagramWebhookDeps = {
  respond?: InstagramRespond;
  fetch?: InstagramFetch;
};

async function resolveInstagramChannel(accountId: string): Promise<ChannelConnection | null> {
  // The indexed columns make this a single lookup even with many tenants.
  const indexed = await prisma.channelConnection.findFirst({
    where: {
      channelType: "INSTAGRAM",
      status: "CONNECTED",
      externalAccountId: accountId,
    },
  });
  if (indexed) return indexed;

  // Rows connected before the indexed column existed can still be matched from
  // their encrypted config, but only for this exact account id.
  const candidates = await prisma.channelConnection.findMany({
    where: { channelType: "INSTAGRAM", status: "CONNECTED", externalAccountId: null },
  });
  return (
    candidates.find((candidate) => {
      const connection = readInstagramConnection(candidate.configJson);
      return connection?.accountId === accountId;
    }) ?? null
  );
}

export async function processInstagramWebhook(
  payload: InstagramWebhookPayload,
  deps: InstagramWebhookDeps = {},
): Promise<InstagramWebhookSummary> {
  const summary: InstagramWebhookSummary = {
    received: 0,
    processed: 0,
    duplicates: 0,
    ignored: 0,
    repliesSent: 0,
    errors: 0,
  };

  if (payload.object !== "instagram") return summary;

  for (const entry of payload.entry ?? []) {
    const accountId = typeof entry.id === "string" ? entry.id : "";
    if (!accountId) continue;

    const channel = await resolveInstagramChannel(accountId);
    if (!channel) {
      summary.ignored += 1;
      continue;
    }

    const business: Business | null = await prisma.business.findUnique({
      where: { id: channel.businessId },
    });
    if (!business) {
      summary.ignored += 1;
      continue;
    }

    for (const event of entry.messaging ?? []) {
      summary.received += 1;
      const message = event.message;
      const senderId = event.sender?.id;

      // Self-echoes are the business's own outbound DMs. senderId === accountId
      // covers the same case for platforms that omit is_echo.
      if (
        !message ||
        message.is_echo ||
        message.app_id ||
        !senderId ||
        senderId === accountId
      ) {
        summary.ignored += 1;
        continue;
      }

      const text = typeof message.text === "string" ? message.text.trim() : "";
      const mid = typeof message.mid === "string" ? message.mid : "";
      if (!text || !mid) {
        summary.ignored += 1;
        continue;
      }

      try {
        const outcome = await (deps.respond ?? respondToContact)({
          business,
          channel: "INSTAGRAM",
          externalMessageId: `instagram:dm:${mid}`,
          customerName: senderId,
          customerHandle: senderId,
          query: text,
        });
        if (outcome.duplicate) {
          summary.duplicates += 1;
          continue;
        }
        summary.processed += 1;

        if (outcome.shouldAutoSend && outcome.answer.trim()) {
          try {
            await sendInstagramDm(channel, senderId, outcome.answer, deps.fetch ?? fetch);
            summary.repliesSent += 1;
          } catch (error) {
            summary.errors += 1;
            console.error("[instagram] auto-reply failed", {
              businessId: business.id,
              ticketId: outcome.ticketId,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      } catch (error) {
        summary.errors += 1;
        console.error("[instagram] webhook DM failed", {
          businessId: business.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const value = change.value;
      summary.received += 1;

      const commentId = typeof value?.id === "string" ? value.id : "";
      const text = typeof value?.text === "string" ? value.text.trim() : "";
      const fromId = typeof value?.from?.id === "string" ? value.from.id : "";

      // The business's own comment (or a reply posted by the app) is not a
      // customer question; answering it would create an infinite loop.
      if (!commentId || !text || !fromId || fromId === accountId) {
        summary.ignored += 1;
        continue;
      }

      try {
        const outcome = await (deps.respond ?? respondToContact)({
          business,
          channel: "INSTAGRAM",
          externalMessageId: `instagram:comment:${commentId}`,
          customerName: typeof value?.from?.username === "string" ? value.from.username : fromId,
          customerHandle: fromId,
          query: text,
        });
        if (outcome.duplicate) {
          summary.duplicates += 1;
          continue;
        }
        summary.processed += 1;

        if (outcome.shouldAutoSend && outcome.answer.trim()) {
          try {
            await replyToInstagramComment(channel, commentId, outcome.answer, deps.fetch ?? fetch);
            summary.repliesSent += 1;
          } catch (error) {
            summary.errors += 1;
            console.error("[instagram] comment reply failed", {
              businessId: business.id,
              ticketId: outcome.ticketId,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      } catch (error) {
        summary.errors += 1;
        console.error("[instagram] webhook comment failed", {
          businessId: business.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  return summary;
}

// Meta integration (Facebook Login for Pages + linked Instagram professional
// accounts). One OAuth round returns the Pages the owner can manage; the owner
// then picks one Page (Messenger) or one linked Instagram account. Only the
// selected asset's long-lived Page token is stored, encrypted, on the channel
// row — no "universal Meta key" exists and none is assumed.
//
// Sending: POST /{page-id}/messages with the Page access token for both
// Messenger and Instagram messaging (Messenger Platform for Instagram).
// Receiving: Page webhooks for Messenger (object "page") and app-level
// Instagram webhooks (object "instagram"), both signature-verified here.

import { createHmac, timingSafeEqual } from "node:crypto";

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
export type MetaRespond = (contact: InboundContact) => Promise<RespondResult>;

const GRAPH_BASE = "https://graph.facebook.com";
const OAUTH_DIALOG_BASE = "https://www.facebook.com";
const DEFAULT_GRAPH_VERSION = "v26.0";
const PENDING_TTL_MS = 20 * 60 * 1000;
const MAX_PAGE_FETCHES = 5;

export const META_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
] as const;

export const META_PENDING_KEY = "metaPending";
export const META_CONNECTION_KEY = "metaConnection";
export const META_ERROR_KEY = "metaLastError";

export type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type MetaSettings = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  verifyToken: string;
  configured: boolean;
};

export function readMetaSettings(): MetaSettings {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const requestedVersion = process.env.META_GRAPH_VERSION?.trim() ?? "";
  const graphVersion = /^v\d+\.\d+$/.test(requestedVersion)
    ? requestedVersion
    : DEFAULT_GRAPH_VERSION;

  return {
    appId,
    appSecret,
    graphVersion,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "",
    configured: Boolean(appId && appSecret),
  };
}

export function isMetaConfigured(): boolean {
  return readMetaSettings().configured;
}

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${readMetaSettings().graphVersion}/${path}`;
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

function safeGraphError(json: JsonRecord): string | null {
  const error = json.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 300);
  }
  if (typeof error === "string") return error.slice(0, 300);
  if (typeof json.error_description === "string") return json.error_description.slice(0, 300);
  return null;
}

function graphErrorCode(json: JsonRecord): number | null {
  const error = json.error;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

export function buildMetaAuthorizationUrl(input: { redirectUri: string; state: string }): string {
  const settings = readMetaSettings();
  if (!settings.configured) {
    throw new IntegrationError(
      503,
      "META_NOT_CONFIGURED",
      "Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET."
    );
  }

  const url = new URL(`${OAUTH_DIALOG_BASE}/${settings.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

export type MetaTokenResult = {
  accessToken: string;
  expiresInSeconds: number | null;
};

// Short-lived code token -> long-lived user token. Page tokens fetched with a
// long-lived user token are effectively non-expiring, which is why the
// exchange failure is fatal instead of falling back to the 1-2 hour token.
export async function exchangeMetaCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: MetaFetch | undefined;
}): Promise<MetaTokenResult> {
  const settings = readMetaSettings();
  if (!settings.configured) {
    throw new IntegrationError(503, "META_NOT_CONFIGURED", "Meta OAuth is not configured.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const shortUrl = new URL(graphUrl("oauth/access_token"));
  shortUrl.searchParams.set("client_id", settings.appId);
  shortUrl.searchParams.set("client_secret", settings.appSecret);
  shortUrl.searchParams.set("redirect_uri", input.redirectUri);
  shortUrl.searchParams.set("code", input.code);

  const shortResponse = await fetchImpl(shortUrl.toString());
  const shortJson = await readJson(shortResponse);
  if (!shortResponse.ok || typeof shortJson.access_token !== "string") {
    throw new IntegrationError(
      502,
      "META_OAUTH_FAILED",
      safeGraphError(shortJson) ?? "Meta rejected the authorization code."
    );
  }

  const longUrl = new URL(graphUrl("oauth/access_token"));
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", settings.appId);
  longUrl.searchParams.set("client_secret", settings.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortJson.access_token);

  const longResponse = await fetchImpl(longUrl.toString());
  const longJson = await readJson(longResponse);
  if (!longResponse.ok || typeof longJson.access_token !== "string") {
    throw new IntegrationError(
      502,
      "META_TOKEN_EXCHANGE_FAILED",
      safeGraphError(longJson) ?? "Meta did not return a long-lived access token."
    );
  }

  return {
    accessToken: longJson.access_token,
    expiresInSeconds: typeof longJson.expires_in === "number" ? longJson.expires_in : null,
  };
}

export type MetaInstagramAccount = { id: string; username: string; name: string };

export type FetchedMetaPage = {
  id: string;
  name: string;
  accessToken: string;
  instagram: MetaInstagramAccount | null;
};

function readInstagramAccount(value: unknown): MetaInstagramAccount | null {
  if (typeof value !== "object" || value === null) return null;

  let candidate: unknown = value;
  if ("data" in value && Array.isArray((value as { data?: unknown }).data)) {
    candidate = (value as { data: unknown[] }).data[0];
  }
  if (typeof candidate !== "object" || candidate === null) return null;

  const account = candidate as { id?: unknown; username?: unknown; name?: unknown };
  if (typeof account.id !== "string" || !account.id) return null;

  return {
    id: account.id,
    username: typeof account.username === "string" ? account.username : "",
    name:
      typeof account.name === "string" && account.name
        ? account.name
        : typeof account.username === "string"
          ? account.username
          : account.id,
  };
}

export async function fetchMetaPages(
  userAccessToken: string,
  fetchImpl: MetaFetch = fetch
): Promise<FetchedMetaPage[]> {
  const pages: FetchedMetaPage[] = [];
  let nextUrl: string | null = null;

  const firstUrl = new URL(graphUrl("me/accounts"));
  firstUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username,name}"
  );
  firstUrl.searchParams.set("limit", "100");
  nextUrl = firstUrl.toString();

  for (let page = 0; nextUrl && page < MAX_PAGE_FETCHES; page += 1) {
    // paging.next comes from Meta; only follow the Graph host so a malformed
    // response cannot redirect this server-side request somewhere else.
    if (!nextUrl.startsWith(`${GRAPH_BASE}/`)) break;

    const response = await fetchImpl(nextUrl, {
      headers: { authorization: `Bearer ${userAccessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok) {
      throw new IntegrationError(
        502,
        "META_ASSETS_FAILED",
        safeGraphError(json) ?? "Meta did not return the authorized Pages."
      );
    }

    const data = Array.isArray(json.data) ? json.data : [];
    for (const raw of data) {
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as {
        id?: unknown;
        name?: unknown;
        access_token?: unknown;
        instagram_business_account?: unknown;
      };
      if (typeof entry.id !== "string" || !entry.id) continue;
      if (typeof entry.access_token !== "string" || !entry.access_token) continue;

      pages.push({
        id: entry.id,
        name: typeof entry.name === "string" && entry.name ? entry.name : entry.id,
        accessToken: entry.access_token,
        instagram: readInstagramAccount(entry.instagram_business_account),
      });
    }

    const paging = json.paging;
    const nextCandidate =
      typeof paging === "object" && paging !== null && typeof (paging as { next?: unknown }).next === "string"
        ? (paging as { next: string }).next
        : null;
    nextUrl = nextCandidate;
  }

  return pages;
}

export type StoredMetaPage = {
  id: string;
  name: string;
  token: string;
  instagram: MetaInstagramAccount | null;
};

export type MetaPendingSelection = {
  userId: string;
  pages: StoredMetaPage[];
  createdAt: string;
  expiresAt: string;
};

function parseStoredPage(value: unknown): StoredMetaPage | null {
  if (typeof value !== "object" || value === null) return null;
  const page = value as {
    id?: unknown;
    name?: unknown;
    token?: unknown;
    instagram?: unknown;
  };
  if (typeof page.id !== "string" || !page.id || typeof page.token !== "string") return null;

  return {
    id: page.id,
    name: typeof page.name === "string" && page.name ? page.name : page.id,
    token: page.token,
    instagram: readInstagramAccount(page.instagram),
  };
}

export function readMetaPending(configJson: string | null): MetaPendingSelection | null {
  const value = readChannelConfig(configJson)[META_PENDING_KEY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const pending = value as Partial<MetaPendingSelection>;
  if (
    typeof pending.userId !== "string" ||
    !pending.userId ||
    typeof pending.expiresAt !== "string" ||
    !Array.isArray(pending.pages)
  ) {
    return null;
  }
  if (Date.parse(pending.expiresAt) < Date.now()) return null;

  const pages = pending.pages.map(parseStoredPage).filter((page): page is StoredMetaPage => page !== null);
  return {
    userId: pending.userId,
    pages,
    createdAt: typeof pending.createdAt === "string" ? pending.createdAt : "",
    expiresAt: pending.expiresAt,
  };
}

export async function storeMetaPendingSelection(input: {
  businessId: string;
  userId: string;
  pages: FetchedMetaPage[];
}): Promise<{ expiresAt: string }> {
  const channel = await ensureChannelConnection(input.businessId, "FACEBOOK");
  const now = Date.now();
  const pending: MetaPendingSelection = {
    userId: input.userId,
    pages: input.pages.map((page) => ({
      id: page.id,
      name: page.name,
      token: encryptSecret(page.accessToken),
      instagram: page.instagram,
    })),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PENDING_TTL_MS).toISOString(),
  };

  await updateChannelConfig(channel, {
    config: { [META_PENDING_KEY]: pending, [META_ERROR_KEY]: null },
  });

  return { expiresAt: pending.expiresAt };
}

export type MetaAsset = {
  kind: "page" | "instagram";
  id: string;
  name: string;
  username: string | null;
  pageId: string;
  pageName: string;
};

export function toMetaAssets(pages: StoredMetaPage[]): MetaAsset[] {
  const assets: MetaAsset[] = [];
  for (const page of pages) {
    assets.push({
      kind: "page",
      id: page.id,
      name: page.name,
      username: null,
      pageId: page.id,
      pageName: page.name,
    });
    if (page.instagram) {
      assets.push({
        kind: "instagram",
        id: page.instagram.id,
        name: page.instagram.name,
        username: page.instagram.username || null,
        pageId: page.id,
        pageName: page.name,
      });
    }
  }
  return assets;
}

async function findPendingChannel(businessId: string): Promise<ChannelConnection> {
  return ensureChannelConnection(businessId, "FACEBOOK");
}

export async function getMetaAssetsForBusiness(
  businessId: string,
  userId: string
): Promise<{ assets: MetaAsset[]; expiresAt: string }> {
  const channel = await findPendingChannel(businessId);
  const pending = readMetaPending(channel.configJson);
  if (!pending) {
    throw new IntegrationError(
      410,
      "META_SELECTION_EXPIRED",
      "The Meta selection expired. Start the Meta connection again."
    );
  }
  if (pending.userId !== userId) {
    throw new IntegrationError(403, "FORBIDDEN", "This Meta selection belongs to a different user.");
  }

  return { assets: toMetaAssets(pending.pages), expiresAt: pending.expiresAt };
}

export async function completeMetaAuthorization(input: {
  businessId: string;
  userId: string;
  code: string;
  redirectUri: string;
  fetchImpl?: MetaFetch | undefined;
}): Promise<{ assets: MetaAsset[]; expiresAt: string }> {
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, ownerId: input.userId },
    select: { id: true },
  });
  if (!business) {
    throw new IntegrationError(403, "FORBIDDEN", "You do not have access to this business.");
  }

  const token = await exchangeMetaCode({
    code: input.code,
    redirectUri: input.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  const pages = await fetchMetaPages(token.accessToken, input.fetchImpl ?? fetch);
  if (pages.length === 0) {
    throw new IntegrationError(
      400,
      "META_NO_ASSETS",
      "No Facebook Page with messaging access was returned. Check that the owner manages a Page and granted pages_show_list."
    );
  }

  const { expiresAt } = await storeMetaPendingSelection({
    businessId: input.businessId,
    userId: input.userId,
    pages,
  });

  return {
    assets: toMetaAssets(
      pages.map((page) => ({
        id: page.id,
        name: page.name,
        token: "",
        instagram: page.instagram,
      }))
    ),
    expiresAt,
  };
}

export type MetaConnection = {
  kind: "page" | "instagram";
  assetId: string;
  pageId: string;
  pageName: string;
  igId: string | null;
  igUsername: string | null;
  token: string;
  scopes: string[];
  graphVersion: string;
  connectedAt: string;
  previousStatus: string | null;
  previousAutoSend: boolean | null;
};

export function readMetaConnection(configJson: string | null): MetaConnection | null {
  const value = readChannelConfig(configJson)[META_CONNECTION_KEY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const connection = value as Partial<MetaConnection>;
  if (
    (connection.kind !== "page" && connection.kind !== "instagram") ||
    typeof connection.assetId !== "string" ||
    !connection.assetId ||
    typeof connection.pageId !== "string" ||
    !connection.pageId ||
    typeof connection.token !== "string" ||
    !connection.token
  ) {
    return null;
  }

  return {
    kind: connection.kind,
    assetId: connection.assetId,
    pageId: connection.pageId,
    pageName: typeof connection.pageName === "string" ? connection.pageName : connection.pageId,
    igId: typeof connection.igId === "string" ? connection.igId : null,
    igUsername: typeof connection.igUsername === "string" ? connection.igUsername : null,
    token: connection.token,
    scopes: Array.isArray(connection.scopes)
      ? connection.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    graphVersion:
      typeof connection.graphVersion === "string"
        ? connection.graphVersion
        : readMetaSettings().graphVersion,
    connectedAt:
      typeof connection.connectedAt === "string" ? connection.connectedAt : new Date().toISOString(),
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

// Messenger needs messages/messaging_postbacks on the Page. Instagram webhooks
// are configured at the app level, not through subscribed_fields (Meta's own
// guidance), so for IG we only attach the Page to the app and document the
// dashboard step.
export async function subscribePageToApp(
  pageId: string,
  pageAccessToken: string,
  mode: "page" | "instagram",
  fetchImpl: MetaFetch = fetch
): Promise<void> {
  const url = new URL(graphUrl(`${encodeURIComponent(pageId)}/subscribed_apps`));
  if (mode === "page") {
    url.searchParams.set("subscribed_fields", "messages,messaging_postbacks");
  }

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { authorization: `Bearer ${pageAccessToken}` },
  });
  const json = await readJson(response);
  if (!response.ok || json.success === false) {
    throw new IntegrationError(
      502,
      "META_SUBSCRIBE_FAILED",
      safeGraphError(json) ?? "Meta did not accept the Page webhook subscription."
    );
  }
}

export type SelectMetaAssetInput = {
  businessId: string;
  userId: string;
  kind: "page" | "instagram";
  assetId: string;
  fetchImpl?: MetaFetch | undefined;
};

export type MetaChannelSummary = {
  connected: boolean;
  status: "connected" | "disconnected" | "error";
  kind: "page" | "instagram" | null;
  pageId: string | null;
  pageName: string | null;
  igUsername: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export function summarizeMetaChannel(channel: ChannelConnection | null): MetaChannelSummary {
  const config = channel ? readChannelConfig(channel.configJson) : {};
  const connection = channel ? readMetaConnection(channel.configJson) : null;
  const lastError =
    typeof config[META_ERROR_KEY] === "string" ? (config[META_ERROR_KEY] as string) : null;
  const connected = Boolean(channel && connection && channel.status === "CONNECTED");

  return {
    connected,
    status: connected ? "connected" : lastError ? "error" : "disconnected",
    kind: connection?.kind ?? null,
    pageId: connection?.pageId ?? null,
    pageName: connection?.pageName ?? null,
    igUsername: connection?.igUsername ?? null,
    connectedAt: connection?.connectedAt ?? null,
    lastError,
  };
}

export async function selectMetaAsset(
  input: SelectMetaAssetInput
): Promise<{ channel: ChannelConnection; provider: "FACEBOOK" | "INSTAGRAM"; summary: MetaChannelSummary }> {
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, ownerId: input.userId },
    select: { id: true },
  });
  if (!business) {
    throw new IntegrationError(403, "FORBIDDEN", "You do not have access to this business.");
  }

  const pendingChannel = await findPendingChannel(input.businessId);
  const pending = readMetaPending(pendingChannel.configJson);
  if (!pending) {
    throw new IntegrationError(
      410,
      "META_SELECTION_EXPIRED",
      "The Meta selection expired. Start the Meta connection again."
    );
  }
  if (pending.userId !== input.userId) {
    throw new IntegrationError(403, "FORBIDDEN", "This Meta selection belongs to a different user.");
  }

  let selectedPage: StoredMetaPage | null = null;
  if (input.kind === "page") {
    selectedPage = pending.pages.find((page) => page.id === input.assetId) ?? null;
  } else {
    selectedPage =
      pending.pages.find((page) => page.instagram?.id === input.assetId) ?? null;
  }

  if (!selectedPage) {
    throw new IntegrationError(
      400,
      "META_ASSET_NOT_AVAILABLE",
      "That Page or Instagram account is not accessible through the Meta login that was just authorized."
    );
  }

  const pageAccessToken = decryptSecret(selectedPage.token);
  await subscribePageToApp(
    selectedPage.id,
    pageAccessToken,
    input.kind,
    input.fetchImpl ?? fetch
  );

  const channelType = input.kind === "page" ? "FACEBOOK" : "INSTAGRAM";
  const channel = await ensureChannelConnection(input.businessId, channelType);
  const existing = readMetaConnection(channel.configJson);
  const now = new Date();

  const connection: MetaConnection = {
    kind: input.kind,
    assetId: input.kind === "page" ? selectedPage.id : (selectedPage.instagram as MetaInstagramAccount).id,
    pageId: selectedPage.id,
    pageName: selectedPage.name,
    igId: input.kind === "instagram" ? (selectedPage.instagram as MetaInstagramAccount).id : null,
    igUsername:
      input.kind === "instagram" ? (selectedPage.instagram as MetaInstagramAccount).username : null,
    token: encryptSecret(pageAccessToken),
    scopes: [...META_SCOPES],
    graphVersion: readMetaSettings().graphVersion,
    connectedAt: now.toISOString(),
    previousStatus:
      channel.status === "CONNECTED"
        ? existing?.previousStatus ?? null
        : isChannelStatus(channel.status)
          ? channel.status
          : null,
    previousAutoSend:
      channel.status === "CONNECTED" ? existing?.previousAutoSend ?? null : channel.autoSend,
  };

  // When the selected channel is the same FACEBOOK row that holds the pending
  // selection, write both changes at once. Updating twice from stale reads
  // would clobber the connection that was just stored.
  const updated = await updateChannelConfig(channel, {
    config: {
      [META_CONNECTION_KEY]: connection,
      [META_ERROR_KEY]: null,
      ...(channelType === "FACEBOOK" ? { [META_PENDING_KEY]: null } : {}),
    },
    status: "CONNECTED",
    autoSend: true,
  });

  // A selection is single-use. Clearing it also means a stale tab cannot pick
  // a different asset after the first connection is live.
  if (channelType !== "FACEBOOK") {
    const freshPendingChannel = await ensureChannelConnection(input.businessId, "FACEBOOK");
    await updateChannelConfig(freshPendingChannel, {
      config: { [META_PENDING_KEY]: null },
    });
  }

  return {
    channel: updated,
    provider: channelType,
    summary: summarizeMetaChannel(updated),
  };
}

async function markMetaReconnectRequired(
  channel: ChannelConnection,
  message: string
): Promise<ChannelConnection> {
  const connection = readMetaConnection(channel.configJson);
  return updateChannelConfig(channel, {
    config: {
      [META_CONNECTION_KEY]: null,
      [META_ERROR_KEY]: message.slice(0, 500),
    },
    status: fallbackStatus(connection?.previousStatus),
    autoSend: connection?.previousAutoSend ?? false,
  });
}

export async function sendMetaMessage(
  channel: ChannelConnection,
  recipientId: string,
  text: string,
  fetchImpl: MetaFetch = fetch
): Promise<{ messageId: string }> {
  const connection = readMetaConnection(channel.configJson);
  if (!connection || channel.status !== "CONNECTED") {
    throw new IntegrationError(409, "META_NOT_CONNECTED", "Connect a Meta Page or Instagram account first.");
  }

  const pageAccessToken = decryptSecret(connection.token);
  const response = await fetchImpl(
    graphUrl(`${encodeURIComponent(connection.pageId)}/messages`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pageAccessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: text.slice(0, 2000) },
      }),
    }
  );
  const json = await readJson(response);

  if (!response.ok) {
    if (graphErrorCode(json) === 190) {
      await markMetaReconnectRequired(
        channel,
        "Meta rejected the Page access token. Reconnect the Meta channel."
      );
      throw new IntegrationError(
        401,
        "META_RECONNECT_REQUIRED",
        "Meta rejected the Page access token. Reconnect the Meta channel."
      );
    }
    throw new IntegrationError(
      502,
      "META_SEND_FAILED",
      safeGraphError(json) ?? "Meta did not accept the message."
    );
  }

  const messageId =
    typeof json.message_id === "string" ? json.message_id : `meta_sent_${Date.now()}`;
  return { messageId };
}

export async function sendMetaForBusiness(input: {
  businessId: string;
  provider: "FACEBOOK" | "INSTAGRAM";
  recipientId: string;
  text: string;
  fetchImpl?: MetaFetch | undefined;
}): Promise<{ messageId: string; provider: "FACEBOOK" | "INSTAGRAM" }> {
  const channel = await prisma.channelConnection.findUnique({
    where: {
      businessId_channelType: { businessId: input.businessId, channelType: input.provider },
    },
  });
  if (!channel) {
    throw new IntegrationError(409, "META_NOT_CONNECTED", "Connect a Meta Page or Instagram account first.");
  }

  const result = await sendMetaMessage(
    channel,
    input.recipientId,
    input.text,
    input.fetchImpl ?? fetch
  );
  return { ...result, provider: input.provider };
}

export type DisconnectMetaInput = {
  businessId: string;
  channel: "facebook" | "instagram" | "all";
  fetchImpl?: MetaFetch | undefined;
};

export type DisconnectMetaResult = {
  facebook: MetaChannelSummary;
  instagram: MetaChannelSummary;
};

export async function disconnectMeta(input: DisconnectMetaInput): Promise<DisconnectMetaResult> {
  const targetTypes: Array<"FACEBOOK" | "INSTAGRAM"> =
    input.channel === "all"
      ? ["FACEBOOK", "INSTAGRAM"]
      : [input.channel === "facebook" ? "FACEBOOK" : "INSTAGRAM"];
  const fetchImpl = input.fetchImpl ?? fetch;
  const unsubscribedPages = new Set<string>();

  const summaries = new Map<string, MetaChannelSummary>();

  for (const channelType of targetTypes) {
    const channel = await prisma.channelConnection.findUnique({
      where: { businessId_channelType: { businessId: input.businessId, channelType } },
    });
    if (!channel) {
      summaries.set(channelType, summarizeMetaChannel(null));
      continue;
    }

    const connection = readMetaConnection(channel.configJson);
    if (connection && !unsubscribedPages.has(connection.pageId)) {
      // The app-level Page subscription is shared by both channel rows, so it
      // is removed only once for the page. Credentials are cleared regardless.
      unsubscribedPages.add(connection.pageId);
      try {
        const token = decryptSecret(connection.token);
        await fetchImpl(graphUrl(`${encodeURIComponent(connection.pageId)}/subscribed_apps`), {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
      } catch (error) {
        console.warn("[meta] could not unsubscribe the Page during disconnect", {
          businessId: input.businessId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const updated = await updateChannelConfig(channel, {
      config: {
        [META_CONNECTION_KEY]: null,
        [META_PENDING_KEY]: null,
        [META_ERROR_KEY]: null,
      },
      status: fallbackStatus(connection?.previousStatus),
      autoSend: connection?.previousAutoSend ?? false,
    });
    summaries.set(channelType, summarizeMetaChannel(updated));
  }

  return {
    facebook: summaries.get("FACEBOOK") ?? summarizeMetaChannel(null),
    instagram: summaries.get("INSTAGRAM") ?? summarizeMetaChannel(null),
  };
}

export type MetaStatus = {
  configured: boolean;
  businessId: string;
  pendingSelection: boolean;
  pendingExpiresAt: string | null;
  facebook: MetaChannelSummary;
  instagram: MetaChannelSummary;
};

export async function getMetaStatus(businessId: string): Promise<MetaStatus> {
  const channels = await prisma.channelConnection.findMany({
    where: { businessId, channelType: { in: ["FACEBOOK", "INSTAGRAM"] } },
  });
  const facebook = channels.find((channel) => channel.channelType === "FACEBOOK") ?? null;
  const instagram = channels.find((channel) => channel.channelType === "INSTAGRAM") ?? null;
  const pending = facebook ? readMetaPending(facebook.configJson) : null;

  return {
    configured: isMetaConfigured(),
    businessId,
    pendingSelection: Boolean(pending),
    pendingExpiresAt: pending?.expiresAt ?? null,
    facebook: summarizeMetaChannel(facebook),
    instagram: summarizeMetaChannel(instagram),
  };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
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

export function verifyMetaWebhookChallenge(input: {
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

export type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number | string;
    attachments?: unknown[];
  };
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

export type MetaWebhookSummary = {
  received: number;
  processed: number;
  duplicates: number;
  ignored: number;
  repliesSent: number;
  errors: number;
};

type MetaWebhookDependencies = {
  respond?: MetaRespond;
  fetch?: MetaFetch;
};

async function findMetaChannelByAssetId(
  channelType: "FACEBOOK" | "INSTAGRAM",
  matcher: (connection: MetaConnection) => boolean
): Promise<ChannelConnection | null> {
  const candidates = await prisma.channelConnection.findMany({
    where: { channelType, status: "CONNECTED" },
  });
  for (const candidate of candidates) {
    const connection = readMetaConnection(candidate.configJson);
    if (connection && matcher(connection)) return candidate;
  }
  return null;
}

async function resolveMetaWebhookTarget(
  object: "page" | "instagram",
  entryId: string
): Promise<{ channel: ChannelConnection; provider: "FACEBOOK" | "INSTAGRAM" } | null> {
  if (object === "page") {
    const page = await findMetaChannelByAssetId("FACEBOOK", (connection) => connection.assetId === entryId);
    if (page) return { channel: page, provider: "FACEBOOK" };
    // Some Instagram notifications arrive under the Page object with the Page
    // id; map them to the IG channel when that Page owns it.
    const linked = await findMetaChannelByAssetId(
      "INSTAGRAM",
      (connection) => connection.pageId === entryId
    );
    return linked ? { channel: linked, provider: "INSTAGRAM" } : null;
  }

  const instagram = await findMetaChannelByAssetId(
    "INSTAGRAM",
    (connection) => connection.assetId === entryId || connection.pageId === entryId
  );
  return instagram ? { channel: instagram, provider: "INSTAGRAM" } : null;
}

export async function processMetaWebhook(
  payload: MetaWebhookPayload,
  deps: MetaWebhookDependencies = {}
): Promise<MetaWebhookSummary> {
  const summary: MetaWebhookSummary = {
    received: 0,
    processed: 0,
    duplicates: 0,
    ignored: 0,
    repliesSent: 0,
    errors: 0,
  };

  const object = payload.object;
  if (object !== "page" && object !== "instagram") return summary;

  for (const entry of payload.entry ?? []) {
    const entryId = typeof entry.id === "string" ? entry.id : "";
    if (!entryId) continue;

    const target = await resolveMetaWebhookTarget(object, entryId);
    if (!target) {
      summary.ignored += 1;
      continue;
    }

    const business: Business | null = await prisma.business.findUnique({
      where: { id: target.channel.businessId },
    });
    if (!business) {
      summary.ignored += 1;
      continue;
    }

    for (const event of entry.messaging ?? []) {
      summary.received += 1;
      const message = event.message;
      const senderId = event.sender?.id;

      // Echoes are the business's own outbound messages; replying to them is
      // the classic infinite-loop bug. Non-text events are acknowledged and
      // ignored because the MVP agent only understands text.
      if (!message || message.is_echo || message.app_id || !senderId) {
        summary.ignored += 1;
        continue;
      }

      const text = typeof message.text === "string" ? message.text.trim() : "";
      if (!text) {
        summary.ignored += 1;
        continue;
      }

      const mid = typeof message.mid === "string" && message.mid ? message.mid : null;
      if (!mid) {
        summary.ignored += 1;
        continue;
      }

      try {
        const outcome = await (deps.respond ?? respondToContact)({
          business,
          channel: target.provider,
          externalMessageId: `meta:${object}:${mid}`,
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
            await sendMetaMessage(
              target.channel,
              senderId,
              outcome.answer,
              deps.fetch ?? fetch
            );
            summary.repliesSent += 1;
          } catch (error) {
            summary.errors += 1;
            console.error("[meta] auto-reply failed", {
              businessId: business.id,
              ticketId: outcome.ticketId,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      } catch (error) {
        summary.errors += 1;
        console.error("[meta] webhook message failed", {
          businessId: business.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  return summary;
}

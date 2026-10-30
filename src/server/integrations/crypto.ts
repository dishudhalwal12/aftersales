// Credential vault and OAuth state signing shared by the Email and Meta
// integrations. Provider tokens are encrypted with AES-256-GCM before they
// touch ChannelConnection.configJson, so a database dump alone cannot be
// replayed against Gmail or Meta. OAuth state is HMAC-signed to stop CSRF and
// tenant-swapping attempts on the callback routes.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { ApiError } from "./api";

const CIPHER = "aes-256-gcm";
const CIPHER_PREFIX = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
export const OAUTH_STATE_TTL_SECONDS = 600;

const OAUTH_PROVIDERS = ["gmail", "meta"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

function readEncryptionKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ApiError(
      503,
      "INTEGRATION_ENCRYPTION_NOT_CONFIGURED",
      "INTEGRATION_ENCRYPTION_KEY is not set, so channel credentials cannot be stored."
    );
  }

  const key = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new ApiError(
      503,
      "INTEGRATION_ENCRYPTION_KEY_INVALID",
      "INTEGRATION_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters."
    );
  }

  return key;
}

export function isIntegrationEncryptionConfigured(): boolean {
  try {
    readEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// Returns v1.<iv>.<tag>.<ciphertext>, all base64url. The version prefix leaves
// room to rotate the format without guessing how old rows were encrypted.
export function encryptSecret(plaintext: string): string {
  const key = readEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== CIPHER_PREFIX) {
    throw new ApiError(
      500,
      "INTEGRATION_SECRET_UNREADABLE",
      "The stored integration credential could not be read."
    );
  }

  try {
    const key = readEncryptionKey();
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("Invalid IV or auth tag.");
    }

    const decipher = createDecipheriv(CIPHER, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "INTEGRATION_SECRET_UNREADABLE",
      "The stored integration credential could not be read."
    );
  }
}

function readStateSecret(): string {
  const secret =
    process.env.INTEGRATION_STATE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new ApiError(
      503,
      "INTEGRATION_STATE_NOT_CONFIGURED",
      "OAuth state signing is not configured. Set INTEGRATION_STATE_SECRET or AUTH_SECRET."
    );
  }
  return secret;
}

export function isOAuthStateSigningConfigured(): boolean {
  try {
    readStateSecret();
    return true;
  } catch {
    return false;
  }
}

export type OAuthStatePayload = {
  provider: OAuthProvider;
  businessId: string;
  userId: string;
  redirectUri: string;
};

export type VerifiedOAuthState = OAuthStatePayload & {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

type StateEnvelope = VerifiedOAuthState & { v: 1 };

function hmacState(body: string): Buffer {
  return createHmac("sha256", readStateSecret()).update(body, "utf8").digest();
}

export function signOAuthState(
  payload: OAuthStatePayload,
  ttlSeconds = OAUTH_STATE_TTL_SECONDS
): string {
  if (!(OAUTH_PROVIDERS as readonly string[]).includes(payload.provider)) {
    throw new ApiError(400, "OAUTH_PROVIDER_INVALID", "Unsupported OAuth provider.");
  }

  const now = Math.floor(Date.now() / 1000);
  const envelope: StateEnvelope = {
    v: 1,
    provider: payload.provider,
    businessId: payload.businessId,
    userId: payload.userId,
    redirectUri: payload.redirectUri,
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: now,
    expiresAt: now + Math.max(60, ttlSeconds),
  };

  const body = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = hmacState(body).toString("base64url");
  return `${body}.${signature}`;
}

function decodeStateEnvelope(body: string): StateEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state could not be read.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state could not be read.");
  }

  const value = parsed as Partial<StateEnvelope>;
  const valid =
    value.v === 1 &&
    typeof value.provider === "string" &&
    (OAUTH_PROVIDERS as readonly string[]).includes(value.provider) &&
    typeof value.businessId === "string" &&
    value.businessId.length > 0 &&
    typeof value.userId === "string" &&
    value.userId.length > 0 &&
    typeof value.redirectUri === "string" &&
    typeof value.nonce === "string" &&
    typeof value.issuedAt === "number" &&
    typeof value.expiresAt === "number";

  if (!valid) {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state could not be read.");
  }

  return value as StateEnvelope;
}

export function verifyOAuthState(token: string | null | undefined): VerifiedOAuthState {
  if (!token) {
    throw new ApiError(400, "OAUTH_STATE_MISSING", "The OAuth state parameter is missing.");
  }

  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state could not be read.");
  }

  const expected = hmacState(body);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state could not be read.");
  }

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "The OAuth state signature is not valid.");
  }

  const envelope = decodeStateEnvelope(body);
  if (envelope.expiresAt * 1000 < Date.now()) {
    throw new ApiError(400, "OAUTH_STATE_EXPIRED", "The OAuth state has expired. Try connecting again.");
  }

  return envelope;
}

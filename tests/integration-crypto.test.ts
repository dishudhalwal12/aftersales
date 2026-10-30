import { strict as assert } from "node:assert";
import { createHmac, randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  OAUTH_STATE_TTL_SECONDS,
  decryptSecret,
  encryptSecret,
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
  signOAuthState,
  verifyOAuthState,
} from "../src/server/integrations/crypto.ts";
import { IntegrationError } from "../src/server/integrations/errors.ts";

const ENV_KEYS = ["INTEGRATION_ENCRYPTION_KEY", "INTEGRATION_STATE_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"];
const saved = new Map<string, string | undefined>();

function integrationError(reason: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof IntegrationError, `expected IntegrationError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  };
}

function signRawState(envelope: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64url");
  return `${body}.${signature}`;
}

before(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
});

after(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("credential vault", () => {
  before(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.INTEGRATION_STATE_SECRET = "state-secret-for-tests";
  });

  it("round-trips a provider token and never exposes plaintext", () => {
    const token = "ya29.a0AfH6SMB-provider-token";
    const encrypted = encryptSecret(token);

    assert.match(encrypted, /^v1\./);
    assert.equal(encrypted.includes(token), false);
    assert.equal(decryptSecret(encrypted), token);
  });

  it("uses a fresh IV so equal secrets do not produce equal ciphertext", () => {
    const first = encryptSecret("same-token");
    const second = encryptSecret("same-token");
    assert.notEqual(first, second);
    assert.equal(decryptSecret(first), "same-token");
    assert.equal(decryptSecret(second), "same-token");
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    const encrypted = encryptSecret("refresh-token");
    const parts = encrypted.split(".");
    const body = parts[3] ?? "";
    const flipped = `${body.slice(0, -2)}${body.endsWith("AA") ? "BB" : "AA"}`;
    const tampered = [parts[0], parts[1], parts[2], flipped].join(".");

    assert.throws(() => decryptSecret(tampered), integrationError("INTEGRATION_SECRET_UNREADABLE"));
  });

  it("cannot decrypt with a different key", () => {
    const encrypted = encryptSecret("refresh-token");
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    assert.throws(() => decryptSecret(encrypted), integrationError("INTEGRATION_SECRET_UNREADABLE"));
  });

  it("rejects a malformed payload", () => {
    assert.throws(() => decryptSecret("not-a-vault-payload"), integrationError("INTEGRATION_SECRET_UNREADABLE"));
    assert.throws(() => decryptSecret("v2.a.b.c"), integrationError("INTEGRATION_SECRET_UNREADABLE"));
  });

  it("reports an unconfigured key and refuses to encrypt", () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;

    assert.equal(isIntegrationEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("token"), integrationError("INTEGRATION_ENCRYPTION_NOT_CONFIGURED"));
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "too-short";

    assert.equal(isIntegrationEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("token"), integrationError("INTEGRATION_ENCRYPTION_KEY_INVALID"));
  });

  it("accepts a 64-character hex key", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const encrypted = encryptSecret("hex-key-token");
    assert.equal(decryptSecret(encrypted), "hex-key-token");
  });
});

describe("OAuth state", () => {
  const secret = "state-secret-for-tests";

  before(() => {
    process.env.INTEGRATION_STATE_SECRET = secret;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  it("round-trips the provider, business, user, and redirect URI", () => {
    const token = signOAuthState({
      provider: "gmail",
      businessId: "business_1",
      userId: "user_1",
      redirectUri: "https://example.com/api/social/email/callback",
    });
    const state = verifyOAuthState(token);

    assert.equal(state.provider, "gmail");
    assert.equal(state.businessId, "business_1");
    assert.equal(state.userId, "user_1");
    assert.equal(state.redirectUri, "https://example.com/api/social/email/callback");
    assert.ok(state.nonce.length > 0);
    assert.ok(state.expiresAt - state.issuedAt >= OAUTH_STATE_TTL_SECONDS);
  });

  it("keeps the Meta provider separate from Gmail state", () => {
    const token = signOAuthState({
      provider: "meta",
      businessId: "business_2",
      userId: "user_2",
      redirectUri: "https://example.com/api/social/meta/callback",
    });
    assert.equal(verifyOAuthState(token).provider, "meta");
  });

  it("enforces a minimum lifetime rather than accepting a zero TTL", () => {
    const token = signOAuthState(
      { provider: "gmail", businessId: "b", userId: "u", redirectUri: "https://example.com/cb" },
      0,
    );
    const state = verifyOAuthState(token);
    assert.equal(state.expiresAt - state.issuedAt, 60);
  });

  it("rejects a missing token", () => {
    assert.throws(() => verifyOAuthState(null), integrationError("OAUTH_STATE_MISSING"));
    assert.throws(() => verifyOAuthState(""), integrationError("OAUTH_STATE_MISSING"));
  });

  it("rejects a token with extra segments or bad structure", () => {
    assert.throws(() => verifyOAuthState("a.b.c"), integrationError("OAUTH_STATE_INVALID"));
    assert.throws(() => verifyOAuthState("onlybody"), integrationError("OAUTH_STATE_INVALID"));
  });

  it("rejects a modified envelope because the signature no longer matches", () => {
    const token = signOAuthState({
      provider: "gmail",
      businessId: "business_1",
      userId: "user_1",
      redirectUri: "https://example.com/cb",
    });
    const [body, signature] = token.split(".");
    assert.ok(body && signature);

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    decoded["businessId"] = "someone_elses_business";
    const swappedBody = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    assert.throws(() => verifyOAuthState(`${swappedBody}.${signature}`), integrationError("OAUTH_STATE_INVALID"));
  });

  it("rejects state signed with a different secret", () => {
    const token = signRawState(
      {
        v: 1,
        provider: "gmail",
        businessId: "business_1",
        userId: "user_1",
        redirectUri: "https://example.com/cb",
        nonce: "abc",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      },
      "a-different-secret",
    );

    assert.throws(() => verifyOAuthState(token), integrationError("OAUTH_STATE_INVALID"));
  });

  it("rejects an expired state even when the signature is valid", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signRawState(
      {
        v: 1,
        provider: "gmail",
        businessId: "business_1",
        userId: "user_1",
        redirectUri: "https://example.com/cb",
        nonce: "abc",
        issuedAt: now - 3600,
        expiresAt: now - 60,
      },
      secret,
    );

    assert.throws(() => verifyOAuthState(token), integrationError("OAUTH_STATE_EXPIRED"));
  });

  it("rejects an unknown provider at signing time", () => {
    assert.throws(
      () =>
        signOAuthState({
          provider: "twitter" as never,
          businessId: "business_1",
          userId: "user_1",
          redirectUri: "https://example.com/cb",
        }),
      integrationError("OAUTH_PROVIDER_INVALID"),
    );
  });

  it("falls back to AUTH_SECRET when INTEGRATION_STATE_SECRET is unset", () => {
    delete process.env.INTEGRATION_STATE_SECRET;
    process.env.AUTH_SECRET = "auth-secret-fallback";

    assert.equal(isOAuthStateSigningConfigured(), true);
    assert.equal(verifyOAuthState(
      signOAuthState({ provider: "gmail", businessId: "b", userId: "u", redirectUri: "https://example.com/cb" }),
    ).businessId, "b");
  });

  it("disables signing when no secret exists at all", () => {
    delete process.env.INTEGRATION_STATE_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    assert.equal(isOAuthStateSigningConfigured(), false);
    assert.throws(
      () => signOAuthState({ provider: "gmail", businessId: "b", userId: "u", redirectUri: "https://example.com/cb" }),
      integrationError("INTEGRATION_STATE_NOT_CONFIGURED"),
    );
  });
});

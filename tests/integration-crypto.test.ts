import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  OAUTH_STATE_TTL_SECONDS,
  decryptSecret,
  encryptSecret,
  isIntegrationEncryptionConfigured,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/integration-crypto";

const STATE_INPUT = {
  provider: "gmail" as const,
  businessId: "biz_crypto_test",
  userId: "user_crypto_test",
  redirectUri: "https://backend.test/api/social/email/callback",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("credential encryption", () => {
  it("round-trips a provider token without storing it in plaintext", () => {
    const encrypted = encryptSecret("refresh-token-value");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptSecret(encrypted)).toBe("refresh-token-value");
    expect(encryptSecret("refresh-token-value")).not.toBe(encrypted);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("token");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3], "base64url");
    ciphertext[0] ^= 0xff;
    parts[3] = ciphertext.toString("base64url");

    expect(() => decryptSecret(parts.join("."))).toThrowError(ApiError);
    try {
      decryptSecret(parts.join("."));
    } catch (error) {
      expect((error as ApiError).code).toBe("INTEGRATION_SECRET_UNREADABLE");
    }
  });

  it("reports a missing key instead of encrypting with a default", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    expect(isIntegrationEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("token")).toThrowError(
      expect.objectContaining({ code: "INTEGRATION_ENCRYPTION_NOT_CONFIGURED" })
    );
  });

  it("rejects a key of the wrong length", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "c2hvcnQ=");
    expect(() => encryptSecret("token")).toThrowError(
      expect.objectContaining({ code: "INTEGRATION_ENCRYPTION_KEY_INVALID" })
    );
  });
});

describe("OAuth state", () => {
  it("signs and verifies a state bound to a provider, business, and user", () => {
    const token = signOAuthState(STATE_INPUT);
    const verified = verifyOAuthState(token);
    expect(verified.provider).toBe("gmail");
    expect(verified.businessId).toBe(STATE_INPUT.businessId);
    expect(verified.userId).toBe(STATE_INPUT.userId);
    expect(verified.redirectUri).toBe(STATE_INPUT.redirectUri);
    expect(verified.expiresAt).toBeGreaterThan(verified.issuedAt);
  });

  it("rejects a tampered signature", () => {
    const token = signOAuthState(STATE_INPUT);
    const [body] = token.split(".");
    const forged = `${body}.${Buffer.from("forged").toString("base64url")}`;
    expect(() => verifyOAuthState(forged)).toThrowError(
      expect.objectContaining({ code: "OAUTH_STATE_INVALID" })
    );
  });

  it("rejects a tampered payload", () => {
    const token = signOAuthState(STATE_INPUT);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ ...STATE_INPUT, businessId: "biz_someone_else", v: 1 })
    ).toString("base64url");
    expect(() => verifyOAuthState(`${forgedBody}.${signature}`)).toThrowError(
      expect.objectContaining({ code: "OAUTH_STATE_INVALID" })
    );
  });

  it("rejects an expired state", () => {
    const token = signOAuthState(STATE_INPUT, 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (OAUTH_STATE_TTL_SECONDS + 60) * 1000);
    expect(() => verifyOAuthState(token)).toThrowError(
      expect.objectContaining({ code: "OAUTH_STATE_EXPIRED" })
    );
  });

  it("rejects missing and malformed state", () => {
    expect(() => verifyOAuthState(null)).toThrowError(
      expect.objectContaining({ code: "OAUTH_STATE_MISSING" })
    );
    expect(() => verifyOAuthState("not-a-state")).toThrowError(
      expect.objectContaining({ code: "OAUTH_STATE_INVALID" })
    );
  });

  it("requires a signing secret", () => {
    vi.stubEnv("INTEGRATION_STATE_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => signOAuthState(STATE_INPUT)).toThrowError(
      expect.objectContaining({ code: "INTEGRATION_STATE_NOT_CONFIGURED" })
    );
  });
});

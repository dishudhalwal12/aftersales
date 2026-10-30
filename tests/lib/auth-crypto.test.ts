import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "../../src/lib/auth-crypto.ts";

describe("password hashing", () => {
  it("accepts the correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    assert.equal(verifyPassword("correct horse battery staple", stored), true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("correct horse battery staple");
    assert.equal(verifyPassword("correct horse battery stapl", stored), false);
  });

  it("salts every hash independently", () => {
    assert.notEqual(hashPassword("same-password"), hashPassword("same-password"));
  });

  it("returns false for a missing or malformed hash", () => {
    assert.equal(verifyPassword("x", null), false);
    assert.equal(verifyPassword("x", ""), false);
    assert.equal(verifyPassword("x", "plaintext"), false);
    assert.equal(verifyPassword("x", "md5$aa$bb"), false);
  });

  it("never stores the raw password", () => {
    const stored = hashPassword("hunter2hunter2");
    assert.ok(!stored.includes("hunter2"));
  });
});

describe("session tokens", () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);

  it("round-trips the subject", () => {
    const token = signSessionToken("user_42", now);
    assert.equal(verifySessionToken(token, now)?.sub, "user_42");
  });

  it("rejects a tampered payload", () => {
    const token = signSessionToken("user_42", now);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "user_admin", exp: Math.floor(now / 1000) + 60 }),
    ).toString("base64url");
    assert.equal(verifySessionToken(`${forged}.${signature}`, now), null);
    assert.notEqual(forged, payload);
  });

  it("rejects a tampered signature", () => {
    const token = signSessionToken("user_42", now);
    assert.equal(verifySessionToken(`${token.slice(0, -2)}xx`, now), null);
  });

  it("rejects an expired token", () => {
    const token = signSessionToken("user_42", now);
    const later = now + 8 * 24 * 60 * 60 * 1000;
    assert.equal(verifySessionToken(token, later), null);
  });

  it("rejects garbage", () => {
    assert.equal(verifySessionToken(undefined, now), null);
    assert.equal(verifySessionToken("", now), null);
    assert.equal(verifySessionToken("no-separator", now), null);
    assert.equal(verifySessionToken("a.b.c", now), null);
  });
});

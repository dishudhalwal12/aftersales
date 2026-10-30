import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { authBaseUrl } from "../../../src/server/auth/supabase/config.ts";

/**
 * The bug this file pins: the deployed app redirected Google sign-in to
 * `http://localhost:3000/dashboard`, because the base URL was read only from `NEXTAUTH_URL`
 * and silently defaulted to localhost. Nothing about a deployment may fall back to localhost
 * while the platform tells us the real origin.
 */
describe("authBaseUrl — production never falls back to localhost silently", () => {
  it("uses the Vercel production domain even when NEXTAUTH_URL still says localhost", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "aftersales.vercel.app",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    assert.equal(base, "https://aftersales.vercel.app");
  });

  it("uses the deployment URL on a preview", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "aftersales-git-main-team41.vercel.app",
    });

    assert.equal(base, "https://aftersales-git-main-team41.vercel.app");
  });

  it("prefers an explicit non-local override over the platform URL", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "aftersales.vercel.app",
      AUTH_BASE_URL: "https://aftersales.example.com",
    });

    assert.equal(base, "https://aftersales.example.com");
  });

  it("accepts NEXTAUTH_URL as the explicit override for a non-Vercel host", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      NEXTAUTH_URL: "https://support.team41.dev/",
    });

    assert.equal(base, "https://support.team41.dev");
  });

  it("reads AUTH_BASE_URL ahead of a stale NEXTAUTH_URL", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      AUTH_BASE_URL: "https://real.example.com",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    assert.equal(base, "https://real.example.com");
  });
});

describe("authBaseUrl — development keeps working", () => {
  it("honours the local NEXTAUTH_URL", () => {
    const base = authBaseUrl({ NODE_ENV: "development", NEXTAUTH_URL: "http://localhost:3000" });

    assert.equal(base, "http://localhost:3000");
  });

  it("defaults to localhost with nothing configured", () => {
    assert.equal(authBaseUrl({}), "http://localhost:3000");
  });

  it("strips trailing slashes so the callback path never doubles", () => {
    const base = authBaseUrl({ NODE_ENV: "development", NEXTAUTH_URL: "http://localhost:3000///" });

    assert.equal(base, "http://localhost:3000");
  });

  it("treats 127.0.0.1 as local, not as a deployment origin", () => {
    const base = authBaseUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "aftersales.vercel.app",
      NEXTAUTH_URL: "http://127.0.0.1:3000",
    });

    assert.equal(base, "https://aftersales.vercel.app");
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  authBaseUrl,
  googleCallbackUrl,
  readSupabaseConfig,
} from "../../../src/server/auth/supabase/config.ts";

const KEY = "sb_publishable_0123456789abcdef";

describe("readSupabaseConfig", () => {
  it("is null when either value is missing, so the button can tell the truth", () => {
    assert.equal(readSupabaseConfig({}), null);
    assert.equal(readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }), null);
    assert.equal(readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY }), null);
  });

  it("rejects a URL that is not http(s)", () => {
    assert.equal(
      readSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "ftp://abc.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY,
      }),
      null,
    );
  });

  it("trims values and drops the trailing slash so path joins never double up", () => {
    const config = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "  https://abc.supabase.co/  ",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: `  ${KEY}  `,
    });
    assert.deepEqual(config, { url: "https://abc.supabase.co", anonKey: KEY });
  });

  it("accepts a local Supabase CLI url over http", () => {
    const config = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY,
    });
    assert.equal(config?.url, "http://127.0.0.1:54321");
  });
});

describe("googleCallbackUrl", () => {
  it("lands on the route handler that exchanges the code", () => {
    assert.equal(
      googleCallbackUrl(authBaseUrl({ NEXTAUTH_URL: "http://localhost:3000" })),
      "http://localhost:3000/auth/callback",
    );
  });

  it("strips a trailing slash from the configured base", () => {
    assert.equal(
      googleCallbackUrl(authBaseUrl({ NEXTAUTH_URL: "https://aftersales.example.com/" })),
      "https://aftersales.example.com/auth/callback",
    );
  });

  it("falls back to localhost when the base is unset, never to the request origin", () => {
    assert.equal(authBaseUrl({}), "http://localhost:3000");
    assert.equal(googleCallbackUrl(authBaseUrl({})), "http://localhost:3000/auth/callback");
  });
});

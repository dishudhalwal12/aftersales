import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  readFrontendRedirectUrl,
  resolveIntegrationBaseUrl,
} from "../src/server/integrations/base-url.ts";
import { readChannelConfig, isChannelStatus } from "../src/server/integrations/channels.ts";
import { assertCronSecret } from "../src/server/integrations/cron.ts";
import { IntegrationError } from "../src/server/integrations/errors.ts";

const ENV_KEYS = [
  "CRON_SECRET",
  "INTEGRATIONS_BASE_URL",
  "INTEGRATIONS_FRONTEND_REDIRECT_URL",
] as const;
const saved = new Map<string, string | undefined>();

function integrationError(reason: string, status?: number) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof IntegrationError, `expected IntegrationError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

function cronRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/social/email/poll", { headers });
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

describe("email polling authentication", () => {
  it("is disabled when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    assert.throws(() => assertCronSecret(cronRequest()), integrationError("CRON_NOT_CONFIGURED", 503));
  });

  it("accepts a matching bearer token", () => {
    process.env.CRON_SECRET = "cron-secret";
    assert.doesNotThrow(() => assertCronSecret(cronRequest({ authorization: "Bearer cron-secret" })));
  });

  it("accepts the x-cron-secret header used by local schedulers", () => {
    process.env.CRON_SECRET = "cron-secret";
    assert.doesNotThrow(() => assertCronSecret(cronRequest({ "x-cron-secret": "cron-secret" })));
  });

  it("rejects a missing or wrong secret", () => {
    process.env.CRON_SECRET = "cron-secret";
    assert.throws(() => assertCronSecret(cronRequest()), integrationError("UNAUTHORIZED", 401));
    assert.throws(
      () => assertCronSecret(cronRequest({ authorization: "Bearer wrong-secret" })),
      integrationError("UNAUTHORIZED", 401),
    );
    assert.throws(
      () => assertCronSecret(cronRequest({ "x-cron-secret": "wrong-secret" })),
      integrationError("UNAUTHORIZED", 401),
    );
  });
});

describe("OAuth base URL resolution", () => {
  it("uses the configured public URL and trims trailing slashes", () => {
    process.env.INTEGRATIONS_BASE_URL = "https://aftersales.example.com///";
    assert.equal(
      resolveIntegrationBaseUrl("http://localhost:3000/api/social/email/connect"),
      "https://aftersales.example.com",
    );
  });

  it("falls back to the request origin in development", () => {
    delete process.env.INTEGRATIONS_BASE_URL;
    assert.equal(
      resolveIntegrationBaseUrl("http://localhost:3000/api/social/email/connect"),
      "http://localhost:3000",
    );
  });

  it("throws when neither a configured URL nor a usable request URL exists", () => {
    delete process.env.INTEGRATIONS_BASE_URL;
    assert.throws(() => resolveIntegrationBaseUrl(), /INTEGRATIONS_BASE_URL/);
    assert.throws(() => resolveIntegrationBaseUrl("not a url"), /INTEGRATIONS_BASE_URL/);
  });

  it("returns a configured frontend redirect only when it is non-blank", () => {
    process.env.INTEGRATIONS_FRONTEND_REDIRECT_URL = "https://app.example.com/dashboard/channels";
    assert.equal(readFrontendRedirectUrl(), "https://app.example.com/dashboard/channels");

    process.env.INTEGRATIONS_FRONTEND_REDIRECT_URL = "   ";
    assert.equal(readFrontendRedirectUrl(), null);
  });
});

describe("channel config helpers", () => {
  it("returns an empty object for missing or malformed JSON", () => {
    assert.deepEqual(readChannelConfig(null), {});
    assert.deepEqual(readChannelConfig(""), {});
    assert.deepEqual(readChannelConfig("not json"), {});
    assert.deepEqual(readChannelConfig("[1,2,3]"), {});
  });

  it("returns a copy of a stored object", () => {
    const config = readChannelConfig(JSON.stringify({ whatsappStatus: "connected" }));
    assert.equal(config["whatsappStatus"], "connected");
  });

  it("recognises only the four channel statuses", () => {
    assert.equal(isChannelStatus("CONNECTED"), true);
    assert.equal(isChannelStatus("TEST_MODE"), true);
    assert.equal(isChannelStatus("DRAFT_ONLY"), true);
    assert.equal(isChannelStatus("UNAVAILABLE"), true);
    assert.equal(isChannelStatus("connected"), false);
    assert.equal(isChannelStatus("ACTIVE"), false);
    assert.equal(isChannelStatus(null), false);
  });
});

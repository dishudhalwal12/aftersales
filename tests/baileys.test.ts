import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  BAILEYS_SECRET_HEADER,
  assertBaileysSecret,
  disconnectBaileysConnection,
  getBaileysConnection,
  isBaileysConfigured,
  isBaileysConnectionMissing,
  sendBaileysMessage,
  startBaileysConnection,
} from "../src/server/integrations/baileys.ts";
import { IntegrationError } from "../src/server/integrations/errors.ts";
import { fetchStub, jsonResponse, requestJson } from "./integrations-helpers.ts";

const ENV_KEYS = ["BAILEYS_SERVICE_URL", "BAILEYS_SERVICE_SECRET", "BAILEYS_TIMEOUT_MS"] as const;
const saved = new Map<string, string | undefined>();

function integrationError(reason: string, status?: number) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof IntegrationError, `expected IntegrationError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

before(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env.BAILEYS_SERVICE_URL = "http://localhost:3001";
  process.env.BAILEYS_SERVICE_SECRET = "service-secret";
  process.env.BAILEYS_TIMEOUT_MS = "15000";
});

after(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Baileys service configuration", () => {
  it("is configured only when both the URL and the shared secret exist", () => {
    assert.equal(isBaileysConfigured(), true);

    delete process.env.BAILEYS_SERVICE_SECRET;
    assert.equal(isBaileysConfigured(), false);
    process.env.BAILEYS_SERVICE_SECRET = "service-secret";
  });

  it("validates the service secret in constant time and never echoes it", () => {
    assert.doesNotThrow(() => assertBaileysSecret("service-secret"));
    assert.throws(() => assertBaileysSecret("wrong-secret"), integrationError("UNAUTHORIZED", 401));
    assert.throws(() => assertBaileysSecret(""), integrationError("UNAUTHORIZED", 401));
    assert.throws(() => assertBaileysSecret(null), integrationError("UNAUTHORIZED", 401));
  });

  it("refuses inbound traffic when the service is not configured", () => {
    delete process.env.BAILEYS_SERVICE_URL;
    assert.throws(() => assertBaileysSecret("service-secret"), integrationError("BAILEYS_NOT_CONFIGURED", 503));
    process.env.BAILEYS_SERVICE_URL = "http://localhost:3001";
  });
});

describe("Baileys service client", () => {
  it("asks the service to open a socket with the business binding", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({
        connectionId: "wa_connection_1",
        businessId: "business_1",
        status: "qr",
        qr: "data:image/png;base64,qr-payload",
        qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const snapshot = await startBaileysConnection("wa_connection_1", "business_1", fetch.impl);

    assert.equal(snapshot.status, "qr");
    assert.equal(snapshot.qr, "data:image/png;base64,qr-payload");
    assert.equal(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.ok(call);
    assert.equal(call.url, "http://localhost:3001/connect");
    assert.equal(call.init?.method, "POST");
    const headers = call.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.[BAILEYS_SECRET_HEADER], "service-secret");
    assert.deepEqual(requestJson(call), { connectionId: "wa_connection_1", businessId: "business_1" });
  });

  it("fetches the QR separately only while the service reports a QR state", async () => {
    const fetch = fetchStub((url) => {
      if (url.includes("/qr/")) {
        return jsonResponse({
          connectionId: "wa_connection_1",
          status: "qr",
          qr: "data:image/png;base64,refreshed",
        });
      }
      return jsonResponse({ connectionId: "wa_connection_1", status: "qr" });
    });

    const snapshot = await getBaileysConnection("wa_connection_1", fetch.impl);

    assert.equal(snapshot.qr, "data:image/png;base64,refreshed");
    assert.equal(fetch.calls.length, 2);
    assert.equal(fetch.calls[0]?.url, "http://localhost:3001/status/wa_connection_1");
    assert.equal(fetch.calls[1]?.url, "http://localhost:3001/qr/wa_connection_1");
  });

  it("does not ask for a QR when the device is already connected", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({
        connectionId: "wa_connection_1",
        status: "connected",
        phoneNumber: "+919810000199",
        connectedAt: new Date().toISOString(),
      }),
    );

    const snapshot = await getBaileysConnection("wa_connection_1", fetch.impl);
    assert.equal(snapshot.status, "connected");
    assert.equal(snapshot.phoneNumber, "+919810000199");
    assert.equal(fetch.calls.length, 1);
  });

  it("rejects a response with an unknown status instead of guessing", async () => {
    const fetch = fetchStub(() => jsonResponse({ connectionId: "wa_connection_1", status: "paired" }));
    await assert.rejects(
      () => getBaileysConnection("wa_connection_1", fetch.impl),
      integrationError("BAILEYS_INVALID_RESPONSE", 502),
    );
  });

  it("reports a rejected backend secret as an integration problem, not a user logout", async () => {
    const fetch = fetchStub(() => jsonResponse({ error: { code: "UNAUTHORIZED", message: "bad secret" } }, 401));
    await assert.rejects(
      () => getBaileysConnection("wa_connection_1", fetch.impl),
      integrationError("BAILEYS_AUTH_FAILED", 502),
    );
  });

  it("propagates the service's CONNECTION_NOT_FOUND code so callers can offer a reconnect", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({ error: { code: "CONNECTION_NOT_FOUND", message: "Unknown connection" } }, 404),
    );

    await assert.rejects(
      () => getBaileysConnection("wa_connection_1", fetch.impl),
      integrationError("CONNECTION_NOT_FOUND", 404),
    );
  });

  it("recognises only the service's missing-connection error", () => {
    assert.equal(
      isBaileysConnectionMissing(new IntegrationError(404, "CONNECTION_NOT_FOUND", "gone")),
      true,
    );
    assert.equal(
      isBaileysConnectionMissing(new IntegrationError(404, "WHATSAPP_NOT_CONNECTED", "gone")),
      false,
    );
    assert.equal(isBaileysConnectionMissing(new Error("404")), false);
  });

  it("maps an unreachable service to a retryable 502", async () => {
    const fetch = fetchStub(() => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      () => getBaileysConnection("wa_connection_1", fetch.impl),
      integrationError("BAILEYS_UNAVAILABLE", 502),
    );
  });

  it("sends an outbound message through the service", async () => {
    const fetch = fetchStub(() => jsonResponse({ messageId: "wamid.1" }));

    const result = await sendBaileysMessage(
      "wa_connection_1",
      "business_1",
      "+919810000199",
      "Yes, the Pro Plan includes WhatsApp invoicing.",
      fetch.impl,
    );

    assert.equal(result.messageId, "wamid.1");
    const call = fetch.calls[0];
    assert.ok(call);
    assert.equal(call.url, "http://localhost:3001/send");
    assert.equal(call.init?.method, "POST");
    assert.deepEqual(requestJson(call), {
      connectionId: "wa_connection_1",
      businessId: "business_1",
      recipient: "+919810000199",
      message: "Yes, the Pro Plan includes WhatsApp invoicing.",
    });
  });

  it("rejects a send response without a message id", async () => {
    const fetch = fetchStub(() => jsonResponse({ ok: true }));
    await assert.rejects(
      () => sendBaileysMessage("wa_connection_1", "business_1", "+919810000199", "hi", fetch.impl),
      integrationError("BAILEYS_INVALID_RESPONSE", 502),
    );
  });

  it("logs out the device by default on disconnect", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({ connectionId: "wa_connection_1", status: "logged_out" }),
    );

    const snapshot = await disconnectBaileysConnection("wa_connection_1", "business_1", {
      fetchImpl: fetch.impl,
    });

    assert.equal(snapshot.status, "logged_out");
    const call = fetch.calls[0];
    assert.ok(call);
    assert.equal(call.url, "http://localhost:3001/disconnect/wa_connection_1");
    assert.deepEqual(requestJson(call), { businessId: "business_1", logout: true });
  });

  it("can detach without logging the phone out", async () => {
    const fetch = fetchStub(() =>
      jsonResponse({ connectionId: "wa_connection_1", status: "disconnected" }),
    );

    await disconnectBaileysConnection("wa_connection_1", "business_1", { logout: false, fetchImpl: fetch.impl });
    assert.deepEqual(requestJson(fetch.calls[0]), { businessId: "business_1", logout: false });
  });

  it("encodes the connection id in the URL path", async () => {
    const fetch = fetchStub(() => jsonResponse({ connectionId: "wa_a/b", status: "connected" }));
    await getBaileysConnection("wa_a/b", fetch.impl);
    assert.equal(fetch.calls[0]?.url, "http://localhost:3001/status/wa_a%2Fb");
  });
});

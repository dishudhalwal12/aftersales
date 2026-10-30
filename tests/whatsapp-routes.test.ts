import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  WHATSAPP_CONNECTION_ID_PREFIX,
  connectionResponse,
  createWhatsappConnectionId,
  isWhatsappConnectionId,
  readWhatsappConnectionId,
} from "../src/server/integrations/whatsapp.ts";
import { channel } from "./integrations-helpers.ts";

describe("WhatsApp connection ids", () => {
  it("mints a prefixed, URL-safe id per business", () => {
    const first = createWhatsappConnectionId();
    const second = createWhatsappConnectionId();

    assert.equal(first.startsWith(WHATSAPP_CONNECTION_ID_PREFIX), true);
    assert.equal(isWhatsappConnectionId(first), true);
    assert.notEqual(first, second);
  });

  it("rejects a caller-supplied id that was not minted here", () => {
    assert.equal(isWhatsappConnectionId("wa_short"), false);
    assert.equal(isWhatsappConnectionId("connection-12345678"), false);
    assert.equal(isWhatsappConnectionId("wa_bad id!"), false);
    assert.equal(isWhatsappConnectionId(42), false);
    assert.equal(isWhatsappConnectionId(null), false);
  });

  it("reads the id from channel config but ignores malformed values", () => {
    assert.equal(
      readWhatsappConnectionId(JSON.stringify({ whatsappConnectionId: "wa_0123456789abcdef" })),
      "wa_0123456789abcdef",
    );
    assert.equal(readWhatsappConnectionId(JSON.stringify({ whatsappConnectionId: "not-an-id" })), null);
    assert.equal(readWhatsappConnectionId(JSON.stringify({})), null);
    assert.equal(readWhatsappConnectionId(null), null);
  });
});

describe("WhatsApp connection response", () => {
  it("returns link state without any provider credential", () => {
    const response = connectionResponse(
      channel({ whatsappConnectionId: "wa_0123456789abcdef" }, { channelType: "WHATSAPP", status: "CONNECTED" }),
      {
        connectionId: "wa_0123456789abcdef",
        status: "connected",
        qr: null,
        qrExpiresAt: null,
        connectedAt: "2026-10-01T00:00:00.000Z",
        phoneNumber: "+919810000199",
        lastError: null,
      },
    );

    assert.deepEqual(response, {
      businessId: "business_1",
      connectionId: "wa_0123456789abcdef",
      status: "connected",
      qr: null,
      qrExpiresAt: null,
      connectedAt: "2026-10-01T00:00:00.000Z",
      phoneNumber: "+919810000199",
      lastError: null,
      channelStatus: "CONNECTED",
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of ["secret", "session", "creds", "authState", "accessToken", "refreshToken"]) {
      assert.equal(serialized.includes(forbidden), false, `response leaked ${forbidden}`);
    }
  });

  it("exposes the QR only while the service is pairing", () => {
    const response = connectionResponse(
      channel({}, { channelType: "WHATSAPP", status: "TEST_MODE" }),
      {
        connectionId: "wa_0123456789abcdef",
        status: "qr",
        qr: "data:image/png;base64,qr-payload",
        qrExpiresAt: "2026-10-31T10:01:00.000Z",
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
      },
    );

    assert.equal(response.status, "qr");
    assert.equal(response.qr, "data:image/png;base64,qr-payload");
    assert.equal(response.channelStatus, "TEST_MODE");
  });
});

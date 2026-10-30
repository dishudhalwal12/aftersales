import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  channelForProvider,
  isWebhookTokenValid,
} from "../../../src/server/business/channel-webhook.ts";

describe("channelForProvider", () => {
  it("maps the three wired providers to their ticket channel", () => {
    assert.equal(channelForProvider("whatsapp"), "WHATSAPP");
    assert.equal(channelForProvider("instagram"), "INSTAGRAM");
    assert.equal(channelForProvider("gmail"), "GMAIL");
  });

  it("trims and lowercases the path segment", () => {
    assert.equal(channelForProvider(" Instagram "), "INSTAGRAM");
    assert.equal(channelForProvider("GMAIL"), "GMAIL");
  });

  it("refuses a provider this deployment does not accept", () => {
    assert.equal(channelForProvider("telegram"), null);
    assert.equal(channelForProvider(""), null);
  });
});

describe("isWebhookTokenValid", () => {
  it("is disabled when no secret is configured", () => {
    assert.equal(isWebhookTokenValid("", "anything"), false);
    assert.equal(isWebhookTokenValid("   ", "anything"), false);
  });

  it("refuses a missing or wrong token", () => {
    assert.equal(isWebhookTokenValid("secret", ""), false);
    assert.equal(isWebhookTokenValid("secret", "wrong"), false);
    assert.equal(isWebhookTokenValid("secret", "secret-longer"), false);
    assert.equal(isWebhookTokenValid("secret", "secre"), false);
  });

  it("accepts the configured token", () => {
    assert.equal(isWebhookTokenValid("secret", "secret"), true);
    assert.equal(isWebhookTokenValid(" secret ", "secret"), true);
  });
});

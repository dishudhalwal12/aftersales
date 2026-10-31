import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DEFAULT_CHANNELS } from "../../../src/server/business/admin.ts";

describe("new business channel defaults", () => {
  it("lets WhatsApp auto-send once a device is linked", () => {
    const whatsapp = DEFAULT_CHANNELS.find((channel) => channel.type === "WHATSAPP");
    assert.ok(whatsapp);
    assert.equal(whatsapp.autoSend, true);
  });

  it("keeps every other channel draft-only until it is really configured", () => {
    for (const channel of DEFAULT_CHANNELS) {
      if (channel.type === "WHATSAPP") continue;
      assert.equal(channel.autoSend, false, `${channel.type} must start without auto-send`);
    }
  });
});

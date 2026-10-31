import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { transportFor } from "../src/server/integrations/channel-transport.ts";

describe("channel transport copy", () => {
  it("reports a live session once the linked device is connected", () => {
    assert.equal(transportFor("whatsapp", "CONNECTED"), "linked device · live Baileys session");
  });

  it("does not claim a live session while the channel is only simulated", () => {
    assert.match(transportFor("whatsapp", "TEST_MODE"), /simulated inbox/);
    assert.match(transportFor("whatsapp", "DRAFT_ONLY"), /simulated inbox/);
    assert.equal(transportFor("whatsapp", "UNAVAILABLE"), "not configured");
  });

  it("keeps the other providers honest about their prerequisites", () => {
    assert.match(transportFor("instagram", "CONNECTED"), /Instagram/);
    assert.match(transportFor("gmail", "TEST_MODE"), /Gmail/);
    assert.equal(transportFor("unknown", "CONNECTED"), "unknown transport");
  });
});

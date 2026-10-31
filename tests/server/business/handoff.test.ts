import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { handoffReply } from "../../../src/server/business/handoff.ts";

const business = {
  name: "Raju sweets",
  escalationEmail: "support@example.com",
  escalationPhone: "+910000000000",
};

describe("handoff reply", () => {
  it("names the shop and both contact routes", () => {
    const text = handoffReply(business);
    assert.match(text, /Raju sweets/);
    assert.match(text, /support@example.com/);
    assert.match(text, /\+910000000000/);
  });

  it("is deterministic and carries no facts beyond the stored contact details", () => {
    assert.equal(handoffReply(business), handoffReply(business));
    assert.doesNotMatch(handoffReply(business), /price|refund|policy|menu/i);
  });

  it("still reads correctly when only one contact route exists", () => {
    const text = handoffReply({ ...business, escalationPhone: "" });
    assert.match(text, /support@example.com/);
    assert.doesNotMatch(text, /\+910000000000/);
  });
});

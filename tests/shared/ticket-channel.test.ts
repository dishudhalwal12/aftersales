import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { TICKET_CHANNELS, isTicketChannel } from "../../src/shared/domain.ts";

describe("ticket channel filter", () => {
  it("accepts every channel the queue can show", () => {
    for (const channel of TICKET_CHANNELS) assert.equal(isTicketChannel(channel), true, channel);
  });

  it("rejects values a query string could invent", () => {
    for (const value of ["whatsapp", "TELEGRAM", "", "all", null, 42]) {
      assert.equal(isTicketChannel(value), false, String(value));
    }
  });
});

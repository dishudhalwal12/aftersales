import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { chooseWhatsappOutbound } from "../src/server/integrations/whatsapp.ts";

const business = {
  name: "Raju sweets",
  escalationEmail: "support@example.com",
  escalationPhone: "+910000000000",
};

const groundedAnswer = "The Pro Plan is ₹1,499 per month and includes WhatsApp invoicing.";

describe("chooseWhatsappOutbound", () => {
  it("sends the generated answer only on a grounded, allowed R6", () => {
    const outbound = chooseWhatsappOutbound({
      duplicate: false,
      shouldAutoSend: true,
      answer: groundedAnswer,
      canSend: true,
      business,
    });
    assert.deepEqual(outbound, { text: groundedAnswer, handoff: false });
  });

  it("sends the model's own text below the floor, flagged as a hand-off", () => {
    const draft = "Hello and welcome to Raju Sweets! How can we help you today?";
    const outbound = chooseWhatsappOutbound({
      duplicate: false,
      shouldAutoSend: false,
      answer: draft,
      canSend: true,
      business,
    });
    assert.equal(outbound?.handoff, true);
    assert.equal(outbound?.text, draft);
  });

  it("falls back to the fixed contact message when the model produced no text", () => {
    const outbound = chooseWhatsappOutbound({
      duplicate: false,
      shouldAutoSend: false,
      answer: "   ",
      canSend: true,
      business,
    });
    assert.equal(outbound?.handoff, true);
    assert.match(outbound?.text ?? "", /Raju sweets/);
    assert.match(outbound?.text ?? "", /support@example\.com/);
  });

  it("stays silent for a duplicate delivery", () => {
    assert.equal(
      chooseWhatsappOutbound({ duplicate: true, shouldAutoSend: true, answer: groundedAnswer, canSend: true, business }),
      null,
    );
  });

  it("respects a channel the owner put in draft-only mode", () => {
    assert.equal(
      chooseWhatsappOutbound({ duplicate: false, shouldAutoSend: true, answer: groundedAnswer, canSend: false, business }),
      null,
    );
  });
});

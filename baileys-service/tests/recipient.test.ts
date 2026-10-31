import { describe, expect, it } from "vitest";

import { normalizeRecipient } from "../src/connection-manager";

describe("normalizeRecipient", () => {
  it("keeps a WhatsApp LID address intact", () => {
    expect(normalizeRecipient("30425883926709@lid")).toBe("30425883926709@lid");
  });

  it("keeps a phone JID intact and formats a bare number", () => {
    expect(normalizeRecipient("919812345678@s.whatsapp.net")).toBe("919812345678@s.whatsapp.net");
    expect(normalizeRecipient("+91 98123 45678")).toBe("919812345678@s.whatsapp.net");
  });

  it("rejects input with no plausible address", () => {
    expect(normalizeRecipient("hello")).toBeNull();
    expect(normalizeRecipient("123@lid")).toBeNull();
  });
});

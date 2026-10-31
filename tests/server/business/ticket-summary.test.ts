import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { toTicketSummary } from "../../../src/server/business/tickets.ts";

const row = {
  id: "cmvticket1",
  channel: "WHATSAPP",
  customerName: "Vishi Mama",
  customerHandle: "30425883926709@lid",
  customerQuery: "what sweets you have?",
  state: "escalated",
  specialistAssigned: "general",
  intent: "sweets_menu_inquiry",
  sentiment: "neutral",
  urgencyScore: 10,
  confidenceScore: 35,
  actionStatus: "escalated",
  routingRuleHit: "R2",
  aiDraftOrReply: "We do sell sweets…",
  citedChunkIds: '["chk_1","chk_2"]',
  decisionSheetJson: "",
  createdAt: new Date("2026-10-31T03:10:00.000Z"),
  updatedAt: new Date("2026-10-31T03:10:01.000Z"),
};

describe("toTicketSummary", () => {
  it("exposes the ticket id under the field the UI and PATCH both use", () => {
    assert.equal(toTicketSummary(row).ticketId, "cmvticket1");
  });

  it("parses cited chunk ids once, at the boundary", () => {
    assert.deepEqual(toTicketSummary(row).citedChunkIds, ["chk_1", "chk_2"]);
  });

  it("serialises dates as ISO strings", () => {
    assert.equal(toTicketSummary(row).createdAt, "2026-10-31T03:10:00.000Z");
  });

  it("reads an empty decision-sheet column as no sheet", () => {
    assert.equal(toTicketSummary(row).decisionSheet, null);
  });

  it("parses a stored decision sheet at the boundary", () => {
    const sheet = {
      provider: "laya-mlx",
      model: "aac6fef/laya-typed-decisions-mlx",
      sheetVersion: 1,
      latencyMs: 12.5,
      decisions: [
        {
          id: "urgent_now",
          kind: "noul",
          title: "Needs attention now",
          verdict: "urgent",
          probability: 0.91,
          confidence: 0.91,
          options: [],
        },
      ],
    };

    const summary = toTicketSummary({ ...row, decisionSheetJson: JSON.stringify(sheet) });
    assert.equal(summary.decisionSheet?.decisions[0]?.verdict, "urgent");
    assert.equal(toTicketSummary({ ...row, decisionSheetJson: "not json" }).decisionSheet, null);
  });
});

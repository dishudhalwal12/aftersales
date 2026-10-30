import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildInsights, type InsightTicket } from "../../src/lib/insights.ts";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-30T18:00:00.000Z");

function ticket(overrides: Partial<InsightTicket> = {}): InsightTicket {
  return {
    id: "tkt_1",
    channel: "WHATSAPP",
    sentiment: "neutral",
    actionStatus: "answered",
    routingRuleHit: "R6",
    intent: "pricing_inquiry",
    customerQuery: "How much is the Pro plan?",
    citedChunkIds: '["chk_cp_02"]',
    createdAt: new Date(now.getTime() - 2 * HOUR),
    ...overrides,
  };
}

describe("buildInsights", () => {
  it("counts outcomes and rates", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", actionStatus: "answered" }),
        ticket({ id: "2", actionStatus: "answered" }),
        ticket({ id: "3", actionStatus: "draft" }),
        ticket({ id: "4", actionStatus: "escalated", sentiment: "distressed" }),
      ],
      now,
    );
    assert.equal(report.totalTickets, 4);
    assert.equal(report.autoAnswered, 2);
    assert.equal(report.drafts, 1);
    assert.equal(report.escalated, 1);
    assert.equal(report.escalationRate, 25);
    assert.equal(report.autoAnswerRate, 50);
  });

  it("tallies sentiment", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", sentiment: "positive" }),
        ticket({ id: "2", sentiment: "frustrated" }),
        ticket({ id: "3", sentiment: "distressed" }),
        ticket({ id: "4", sentiment: "neutral" }),
      ],
      now,
    );
    assert.deepEqual(report.sentiment, {
      positive: 1,
      neutral: 1,
      frustrated: 1,
      distressed: 1,
    });
  });

  it("surfaces recurring complaints ranked by negative volume", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", intent: "billing_dispute", sentiment: "distressed" }),
        ticket({ id: "2", intent: "billing_dispute", sentiment: "frustrated" }),
        ticket({ id: "3", intent: "pricing_inquiry", sentiment: "neutral" }),
        ticket({ id: "4", intent: "pricing_inquiry", sentiment: "neutral" }),
      ],
      now,
    );
    assert.equal(report.recurringComplaints.length, 2);
    assert.equal(report.recurringComplaints[0]?.intent, "billing_dispute");
    assert.equal(report.recurringComplaints[0]?.negative, 2);
    assert.equal(report.recurringComplaints[0]?.negativeShare, 100);
  });

  it("drops one-off intents from the recurring list", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", intent: "pricing_inquiry" }),
        ticket({ id: "2", intent: "pricing_inquiry" }),
        ticket({ id: "3", intent: "one_off_question" }),
      ],
      now,
    );
    assert.deepEqual(
      report.recurringComplaints.map((complaint) => complaint.intent),
      ["pricing_inquiry"],
    );
  });

  it("ignores tickets older than the window", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", createdAt: new Date(now.getTime() - 2 * HOUR) }),
        ticket({ id: "2", createdAt: new Date(now.getTime() - 9 * 24 * HOUR) }),
      ],
      now,
    );
    assert.equal(report.totalTickets, 1);
  });

  it("reports the busiest channel and the most-fired rule", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", channel: "GMAIL" }),
        ticket({ id: "2", channel: "GMAIL" }),
        ticket({ id: "3", channel: "WHATSAPP", routingRuleHit: "R2" }),
      ],
      now,
    );
    assert.equal(report.busiestChannel, "GMAIL");
    assert.equal(report.topRule, "R6");
  });

  it("counts grounded tickets only", () => {
    const report = buildInsights(
      [
        ticket({ id: "1", citedChunkIds: '["chk_cp_02"]' }),
        ticket({ id: "2", citedChunkIds: "[]" }),
        ticket({ id: "3", citedChunkIds: "" }),
      ],
      now,
    );
    assert.equal(report.citations, 1);
  });

  it("handles an empty window without dividing by zero", () => {
    const report = buildInsights([], now);
    assert.equal(report.totalTickets, 0);
    assert.equal(report.escalationRate, 0);
    assert.equal(report.autoAnswerRate, 0);
    assert.equal(report.busiestChannel, null);
    assert.deepEqual(report.recurringComplaints, []);
  });

  it("labels the window it measured", () => {
    const report = buildInsights([ticket()], now, 7);
    assert.equal(report.windowDays, 7);
    assert.equal(report.to, now.toISOString());
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildWeeklyReport,
  sentimentScore,
  sentimentTrendFor,
  trackSentiment,
  weekWindow,
  type ReportTicket,
} from "../../../src/server/business/weekly-report.ts";

/** Friday 2026-10-30. Completed ISO week: Mon 2026-10-19 → Mon 2026-10-26 (UTC). */
const now = new Date("2026-10-30T18:00:00.000Z");
/** The ISO week containing `now`: Mon 2026-10-26 → Mon 2026-11-02. */
const CURRENT_START = "2026-10-26T00:00:00.000Z";
const CURRENT_END = "2026-11-02T00:00:00.000Z";
/** The last completed week: Mon 2026-10-19 → Mon 2026-10-26. */
const WEEK_START = "2026-10-19T00:00:00.000Z";
const WEEK_END = "2026-10-26T00:00:00.000Z";
const PREV_START = "2026-10-12T00:00:00.000Z";

function ticket(overrides: Partial<ReportTicket> = {}): ReportTicket {
  return {
    id: "tkt_1",
    channel: "WHATSAPP",
    sentiment: "neutral",
    actionStatus: "answered",
    routingRuleHit: "R6",
    intent: "pricing_inquiry",
    customerQuery: "How much is the Pro plan?",
    citedChunkIds: '["chk_cp_02"]',
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    ...overrides,
  };
}

function completedWeekTickets(): ReportTicket[] {
  return [
    ticket({
      id: "c1",
      intent: "refund_delay",
      sentiment: "frustrated",
      actionStatus: "escalated",
      routingRuleHit: "R3",
      customerQuery: "My refund is three weeks late",
      citedChunkIds: "[]",
      createdAt: new Date("2026-10-20T09:00:00.000Z"),
    }),
    ticket({
      id: "c2",
      intent: "refund_delay",
      sentiment: "distressed",
      actionStatus: "escalated",
      routingRuleHit: "R3",
      customerQuery: "This is unacceptable, I need my money back today",
      citedChunkIds: "[]",
      createdAt: new Date("2026-10-21T09:00:00.000Z"),
    }),
    ticket({
      id: "c3",
      intent: "refund_delay",
      sentiment: "neutral",
      actionStatus: "draft",
      routingRuleHit: "R5",
      customerQuery: "When will my refund arrive?",
      citedChunkIds: "[]",
      createdAt: new Date("2026-10-22T09:00:00.000Z"),
    }),
    ticket({
      id: "c4",
      intent: "praise",
      sentiment: "positive",
      actionStatus: "answered",
      routingRuleHit: "R6",
      customerQuery: "The new dashboard is great, thank you",
      citedChunkIds: '["chk_cp_02"]',
      createdAt: new Date("2026-10-23T09:00:00.000Z"),
    }),
  ];
}

describe("weekWindow", () => {
  it("returns the Monday 00:00 UTC week that contains a Friday", () => {
    const window = weekWindow(now);
    assert.equal(window.start.toISOString(), CURRENT_START);
    assert.equal(window.end.toISOString(), CURRENT_END);
  });

  it("puts Monday 00:00 exactly in the new week, not the old one", () => {
    const window = weekWindow(new Date("2026-10-26T00:00:00.000Z"));
    assert.equal(window.start.toISOString(), "2026-10-26T00:00:00.000Z");
    assert.equal(window.end.toISOString(), "2026-11-02T00:00:00.000Z");
  });

  it("still belongs to the old week one second before Monday", () => {
    const window = weekWindow(new Date("2026-10-25T23:59:59.000Z"));
    assert.equal(window.start.toISOString(), WEEK_START);
    assert.equal(window.end.toISOString(), WEEK_END);
  });

  it("steps back whole weeks with weeksAgo", () => {
    const lastWeek = weekWindow(now, 1);
    assert.equal(lastWeek.start.toISOString(), WEEK_START);
    assert.equal(lastWeek.end.toISOString(), WEEK_END);

    const weekBefore = weekWindow(now, 2);
    assert.equal(weekBefore.start.toISOString(), PREV_START);
    assert.equal(weekBefore.end.toISOString(), WEEK_START);
  });

  it("crosses a year boundary without shifting the week start", () => {
    const window = weekWindow(new Date("2026-01-01T12:00:00.000Z"));
    assert.equal(window.start.toISOString(), "2025-12-29T00:00:00.000Z");
    assert.equal(window.end.toISOString(), "2026-01-05T00:00:00.000Z");
  });

  it("never returns a window longer than seven days", () => {
    for (let day = 0; day < 8; day += 1) {
      const instant = new Date(Date.UTC(2026, 9, 19 + day, 12, 0, 0));
      const window = weekWindow(instant, 1);
      assert.equal(window.end.getTime() - window.start.getTime(), 7 * 24 * 60 * 60 * 1000);
      assert.equal(window.start.getUTCDay(), 1);
    }
  });
});

describe("sentimentScore", () => {
  it("is 0 when the week has no sentiment at all", () => {
    assert.equal(
      sentimentScore({ positive: 0, neutral: 0, frustrated: 0, distressed: 0 }),
      0,
    );
  });

  it("is 100 for an all-positive week and 0 for an all-distressed week", () => {
    assert.equal(sentimentScore({ positive: 3, neutral: 0, frustrated: 0, distressed: 0 }), 100);
    assert.equal(sentimentScore({ positive: 0, neutral: 0, frustrated: 0, distressed: 3 }), 0);
  });

  it("weights a mixed week and rounds to an integer", () => {
    // (100 + 50 + 20 + 0) / 4 = 42.5 → 43
    assert.equal(sentimentScore({ positive: 1, neutral: 1, frustrated: 1, distressed: 1 }), 43);
  });
});

describe("sentimentTrendFor", () => {
  it("reports a baseline when there is no previous week to compare with", () => {
    assert.equal(sentimentTrendFor(43, null), "baseline");
  });

  it("moves at a five-point threshold and stays put inside it", () => {
    assert.equal(sentimentTrendFor(50, 45), "improving");
    assert.equal(sentimentTrendFor(50, 51), "stable");
    assert.equal(sentimentTrendFor(50, 46), "stable");
    assert.equal(sentimentTrendFor(45, 50), "worsening");
    assert.equal(sentimentTrendFor(46, 50), "stable");
  });
});

describe("buildWeeklyReport", () => {
  const report = buildWeeklyReport({
    tickets: completedWeekTickets(),
    previousTickets: [
      ticket({
        id: "p1",
        intent: "refund_delay",
        sentiment: "distressed",
        actionStatus: "escalated",
        routingRuleHit: "R3",
        customerQuery: "Refund still missing",
        citedChunkIds: "[]",
        createdAt: new Date("2026-10-14T09:00:00.000Z"),
      }),
    ],
    now,
  });

  it("labels the completed week, not the rolling seven days", () => {
    assert.equal(report.weekStart, WEEK_START);
    assert.equal(report.weekEnd, WEEK_END);
    assert.equal(report.windowDays, 7);
  });

  it("counts outcomes and rates for the week", () => {
    assert.equal(report.totalTickets, 4);
    assert.equal(report.autoAnswered, 1);
    assert.equal(report.drafts, 1);
    assert.equal(report.escalated, 2);
    assert.equal(report.failed, 0);
    assert.equal(report.autoAnswerRate, 25);
    assert.equal(report.escalationRate, 50);
  });

  it("tracks the sentiment mix and index against the previous week", () => {
    assert.deepEqual(report.sentiment, {
      positive: 1,
      neutral: 1,
      frustrated: 1,
      distressed: 1,
    });
    assert.equal(report.sentimentScore, 43);
    assert.equal(report.previousScore, 0);
    assert.equal(report.sentimentDelta, 43);
    assert.equal(report.sentimentTrend, "improving");
  });

  it("fills exactly seven UTC days and keeps their totals equal to the week", () => {
    assert.equal(report.dailySentiment.length, 7);
    assert.equal(report.dailySentiment[0]?.date, "2026-10-19");
    assert.equal(report.dailySentiment[6]?.date, "2026-10-25");
    const total = report.dailySentiment.reduce((sum, day) => sum + day.total, 0);
    assert.equal(total, 4);
    assert.equal(report.dailySentiment[3]?.date, "2026-10-22");
    assert.equal(report.dailySentiment[3]?.negative, 0);
    assert.equal(report.dailySentiment[1]?.negative, 1);
    assert.equal(report.dailySentiment[0]?.total, 0);
  });

  it("ranks recurring complaints and carries the week-over-week delta", () => {
    assert.equal(report.recurringComplaints.length, 1);
    const complaint = report.recurringComplaints[0];
    assert.equal(complaint?.intent, "refund_delay");
    assert.equal(complaint?.count, 3);
    assert.equal(complaint?.negative, 2);
    assert.equal(complaint?.negativeShare, 67);
    assert.equal(complaint?.previousCount, 1);
    assert.equal(complaint?.delta, 2);
    assert.equal(complaint?.direction, "rising");
    assert.equal(complaint?.sample, "When will my refund arrive?");
    assert.equal(complaint?.lastSeen, "2026-10-22T09:00:00.000Z");
    assert.equal(report.topComplaint, "refund_delay");
  });

  it("counts grounded citations only", () => {
    assert.equal(report.citations, 1);
  });

  it("excludes rows outside the completed week even when handed in", () => {
    const withOutsider = buildWeeklyReport({
      tickets: [
        ...completedWeekTickets(),
        ticket({ id: "old", createdAt: new Date("2026-10-18T23:00:00.000Z") }),
        ticket({ id: "early", createdAt: new Date("2026-10-26T00:00:00.000Z") }),
      ],
      previousTickets: [],
      now,
    });
    assert.equal(withOutsider.totalTickets, 4);
  });

  it("ignores an unknown sentiment instead of inventing a bucket", () => {
    const withUnknown = buildWeeklyReport({
      tickets: [
        ticket({ id: "u1", sentiment: "positive" }),
        ticket({ id: "u2", sentiment: "angry" }),
      ],
      previousTickets: [],
      now,
    });
    assert.equal(withUnknown.totalTickets, 2);
    assert.deepEqual(withUnknown.sentiment, {
      positive: 1,
      neutral: 0,
      frustrated: 0,
      distressed: 0,
    });
    assert.equal(withUnknown.sentimentScore, 100);
  });

  it("returns a valid empty week without dividing by zero", () => {
    const empty = buildWeeklyReport({ tickets: [], previousTickets: [], now });
    assert.equal(empty.totalTickets, 0);
    assert.equal(empty.escalationRate, 0);
    assert.equal(empty.autoAnswerRate, 0);
    assert.equal(empty.sentimentScore, 0);
    assert.equal(empty.previousScore, null);
    assert.equal(empty.sentimentTrend, "baseline");
    assert.deepEqual(empty.recurringComplaints, []);
    assert.equal(empty.topComplaint, null);
    assert.equal(empty.dailySentiment.length, 7);
  });

  it("excludes a repeated all-positive intent from complaints", () => {
    const happy = buildWeeklyReport({
      tickets: [
        ticket({ id: "h1", intent: "praise", sentiment: "positive" }),
        ticket({ id: "h2", intent: "praise", sentiment: "positive" }),
        ticket({ id: "h3", intent: "praise", sentiment: "positive" }),
      ],
      previousTickets: [],
      now,
    });
    assert.deepEqual(happy.recurringComplaints, []);
    assert.equal(happy.topComplaint, null);
  });

  it("excludes a one-off negative intent from complaints", () => {
    const oneOff = buildWeeklyReport({
      tickets: [ticket({ id: "o1", intent: "outage", sentiment: "distressed" })],
      previousTickets: [],
      now,
    });
    assert.deepEqual(oneOff.recurringComplaints, []);
  });

  it("labels a brand-new repeated complaint as new, a falling one as cooling", () => {
    const complaintTickets = [
      ticket({ id: "n1", intent: "refund_delay", sentiment: "frustrated" }),
      ticket({ id: "n2", intent: "refund_delay", sentiment: "distressed" }),
      ticket({ id: "b1", intent: "billing_dispute", sentiment: "frustrated" }),
      ticket({ id: "b2", intent: "billing_dispute", sentiment: "frustrated" }),
    ];
    const priorWeek = [1, 2, 3, 4].map((index) =>
      ticket({
        id: `prior-${index}`,
        intent: "billing_dispute",
        sentiment: "frustrated",
        createdAt: new Date("2026-10-14T09:00:00.000Z"),
      }),
    );
    const report = buildWeeklyReport({
      tickets: complaintTickets,
      previousTickets: priorWeek,
      now,
    });
    assert.equal(report.recurringComplaints[0]?.intent, "billing_dispute");
    assert.equal(report.recurringComplaints[0]?.direction, "cooling");
    assert.equal(report.recurringComplaints[0]?.delta, -2);
    assert.equal(report.recurringComplaints[1]?.intent, "refund_delay");
    assert.equal(report.recurringComplaints[1]?.direction, "new");
  });

  it("labels an unchanged repeated complaint as steady", () => {
    const steady = buildWeeklyReport({
      tickets: [
        ticket({ id: "s1", intent: "refund_delay", sentiment: "frustrated" }),
        ticket({ id: "s2", intent: "refund_delay", sentiment: "neutral" }),
      ],
      previousTickets: [
        ticket({
          id: "s3",
          intent: "refund_delay",
          sentiment: "frustrated",
          createdAt: new Date(PREV_START),
        }),
        ticket({
          id: "s4",
          intent: "refund_delay",
          sentiment: "neutral",
          createdAt: new Date(PREV_START),
        }),
      ],
      now,
    });
    assert.equal(steady.recurringComplaints[0]?.direction, "steady");
    assert.equal(steady.recurringComplaints[0]?.delta, 0);
  });

  it("caps the complaint list at five intents", () => {
    const many = Array.from({ length: 6 }, (_unused, index) =>
      [0, 1].map((copy) =>
        ticket({
          id: `m-${index}-${copy}`,
          intent: `complaint_${index}`,
          sentiment: "frustrated",
        }),
      ),
    ).flat();
    const capped = buildWeeklyReport({ tickets: many, previousTickets: [], now });
    assert.equal(capped.recurringComplaints.length, 5);
  });

  it("does not mutate the rows it is given", () => {
    const tickets = completedWeekTickets();
    const previous = [
      ticket({ id: "p1", createdAt: new Date("2026-10-14T09:00:00.000Z") }),
    ];
    const ticketSnapshot = structuredClone(tickets);
    const previousSnapshot = structuredClone(previous);
    buildWeeklyReport({ tickets, previousTickets: previous, now });
    assert.deepEqual(tickets, ticketSnapshot);
    assert.deepEqual(previous, previousSnapshot);
  });

  it("is deterministic for identical input", () => {
    const first = buildWeeklyReport({
      tickets: completedWeekTickets(),
      previousTickets: [],
      now,
    });
    const second = buildWeeklyReport({
      tickets: completedWeekTickets(),
      previousTickets: [],
      now,
    });
    assert.deepEqual(first, second);
  });
});

describe("trackSentiment", () => {
  it("compares the last seven days with the seven before them", () => {
    const tracking = trackSentiment(
      [
        ticket({ id: "t1", sentiment: "positive", createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }),
        ticket({
          id: "t2",
          sentiment: "distressed",
          createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        }),
        ticket({
          id: "t3",
          sentiment: "neutral",
          createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        }),
      ],
      now,
      7,
    );
    assert.equal(tracking.score, 50);
    assert.equal(tracking.previousScore, 50);
    assert.equal(tracking.delta, 0);
    assert.equal(tracking.trend, "stable");
    assert.equal(tracking.negativeShare, 50);
    assert.equal(tracking.daily.length, 7);
    assert.equal(tracking.daily[6]?.date, "2026-10-30");
    assert.equal(tracking.daily[0]?.date, "2026-10-24");
  });

  it("reports a baseline when the previous seven days are empty", () => {
    const tracking = trackSentiment(
      [ticket({ id: "t1", sentiment: "frustrated", createdAt: new Date(now.getTime() - 60_000) })],
      now,
    );
    assert.equal(tracking.previousScore, null);
    assert.equal(tracking.trend, "baseline");
    assert.equal(tracking.delta, 0);
    assert.equal(tracking.negativeShare, 100);
  });

  it("does not let a row older than the window change the current score", () => {
    const tracking = trackSentiment(
      [
        ticket({ id: "t1", sentiment: "positive", createdAt: new Date(now.getTime() - 60_000) }),
        ticket({
          id: "t2",
          sentiment: "distressed",
          createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        }),
      ],
      now,
    );
    assert.equal(tracking.score, 100);
    assert.equal(tracking.previousScore, 0);
    assert.equal(tracking.trend, "improving");
  });
});

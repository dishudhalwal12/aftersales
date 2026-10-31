import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { complaintDisplay } from "../../src/shared/insights.ts";
import type { RecurringComplaint, WeeklyComplaintView } from "../../src/shared/api.ts";

const weekly: WeeklyComplaintView[] = [
  {
    intent: "refund_delay",
    count: 3,
    negative: 2,
    negativeShare: 67,
    previousCount: 1,
    delta: 2,
    direction: "rising",
    sample: "When will my refund arrive?",
    lastSeen: "2026-10-22T09:00:00.000Z",
  },
];

const live: RecurringComplaint[] = [
  {
    intent: "technical_issue",
    count: 4,
    negative: 3,
    negativeShare: 75,
    sample: "The dashboard keeps timing out",
    lastSeen: "2026-10-30T09:00:00.000Z",
  },
];

describe("complaintDisplay", () => {
  it("prefers the completed week's complaints and keeps its deltas", () => {
    const display = complaintDisplay({ weekly, live });
    assert.equal(display.source, "weekly");
    assert.deepEqual(display.rows, [
      {
        intent: "refund_delay",
        count: 3,
        negativeShare: 67,
        sample: "When will my refund arrive?",
        lastSeen: "2026-10-22T09:00:00.000Z",
        direction: "rising",
        previousCount: 1,
      },
    ]);
  });

  it("falls back to the live rolling list when the week had no repeated complaint", () => {
    const display = complaintDisplay({ weekly: [], live });
    assert.equal(display.source, "rolling");
    assert.deepEqual(display.rows, [
      {
        intent: "technical_issue",
        count: 4,
        negativeShare: 75,
        sample: "The dashboard keeps timing out",
        lastSeen: "2026-10-30T09:00:00.000Z",
        direction: null,
        previousCount: null,
      },
    ]);
  });

  it("returns an empty rolling display when neither window has a complaint", () => {
    const display = complaintDisplay({ weekly: [], live: [] });
    assert.equal(display.source, "rolling");
    assert.deepEqual(display.rows, []);
  });
});

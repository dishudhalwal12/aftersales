/**
 * Presentation rule for the recurring-complaint list.
 *
 * The week-aligned report is the product's source of truth, but a completed
 * week can be empty (fresh data, a quiet week). Rather than showing "none"
 * while the rolling window has repeated topics, fall back to the live list and
 * say which window the rows came from — no silent mixing of the two windows.
 */

import type { RecurringComplaint, WeeklyComplaintView } from "./api.ts";

export interface ComplaintDisplayRow {
  intent: string;
  count: number;
  negativeShare: number;
  sample: string;
  lastSeen: string;
  /** Week-over-week movement; null on the rolling fallback, which has no prior window. */
  direction: WeeklyComplaintView["direction"] | null;
  previousCount: number | null;
}

export interface ComplaintDisplay {
  source: "weekly" | "rolling";
  rows: ComplaintDisplayRow[];
}

export function complaintDisplay(input: {
  weekly: readonly WeeklyComplaintView[];
  live: readonly RecurringComplaint[];
}): ComplaintDisplay {
  if (input.weekly.length > 0) {
    return {
      source: "weekly",
      rows: input.weekly.map((complaint) => ({
        intent: complaint.intent,
        count: complaint.count,
        negativeShare: complaint.negativeShare,
        sample: complaint.sample,
        lastSeen: complaint.lastSeen,
        direction: complaint.direction,
        previousCount: complaint.previousCount,
      })),
    };
  }

  return {
    source: "rolling",
    rows: input.live.map((complaint) => ({
      intent: complaint.intent,
      count: complaint.count,
      negativeShare: complaint.negativeShare,
      sample: complaint.sample,
      lastSeen: complaint.lastSeen,
      direction: null,
      previousCount: null,
    })),
  };
}

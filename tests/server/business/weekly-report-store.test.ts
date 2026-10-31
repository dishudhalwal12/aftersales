import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildWeeklyReport,
  type ReportTicket,
  type WeeklyReport,
} from "../../../src/server/business/weekly-report.ts";
import {
  ensureWeeklyReport,
  generateWeeklyReportsForAll,
  parseStoredReport,
  readWeeklyHistory,
  toWeeklyReportWrite,
  type StoredWeeklyReportRow,
  type WeeklyReportStore,
  type WeeklyReportWrite,
  type WeeklyReportTrigger,
} from "../../../src/server/business/weekly-report-store.ts";

const now = new Date("2026-10-30T18:00:00.000Z");
const COMPLETED_START = "2026-10-19T00:00:00.000Z";
const COMPLETED_END = "2026-10-26T00:00:00.000Z";
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
    citedChunkIds: "[]",
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    ...overrides,
  };
}

function rowKey(businessId: string, weekStart: Date): string {
  return `${businessId}@${weekStart.toISOString()}`;
}

class FakeStore implements WeeklyReportStore {
  readonly tickets = new Map<string, ReportTicket[]>();
  readonly rows = new Map<string, StoredWeeklyReportRow>();
  readonly saves: WeeklyReportWrite[] = [];
  readonly ticketQueries: { businessId: string; from: Date; to: Date }[] = [];
  businessIds: string[] = ["biz_a"];
  readonly failing = new Set<string>();
  private nextId = 1;

  async findTickets(input: {
    businessId: string;
    from: Date;
    to: Date;
  }): Promise<ReportTicket[]> {
    this.ticketQueries.push(input);
    if (this.failing.has(input.businessId)) {
      throw new Error(`db down for ${input.businessId}`);
    }
    return (this.tickets.get(input.businessId) ?? []).filter(
      (row) => row.createdAt >= input.from && row.createdAt < input.to,
    );
  }

  async findReport(input: {
    businessId: string;
    weekStart: Date;
  }): Promise<StoredWeeklyReportRow | null> {
    return this.rows.get(rowKey(input.businessId, input.weekStart)) ?? null;
  }

  async saveReport(write: WeeklyReportWrite): Promise<StoredWeeklyReportRow> {
    this.saves.push(write);
    const key = rowKey(write.businessId, write.weekStart);
    const existing = this.rows.get(key);
    const row: StoredWeeklyReportRow = {
      id: existing?.id ?? `wr_${this.nextId++}`,
      ...write,
    };
    this.rows.set(key, row);
    return row;
  }

  async listReportHistory(input: {
    businessId: string;
    limit: number;
  }): Promise<StoredWeeklyReportRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.businessId === input.businessId)
      .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
      .slice(0, input.limit);
  }

  async listBusinessIds(): Promise<string[]> {
    return [...this.businessIds];
  }
}

function seedEmptyReport(
  store: FakeStore,
  businessId: string,
  weekStartIso: string,
  trigger: WeeklyReportTrigger = "cron",
): WeeklyReport {
  const weekStart = new Date(weekStartIso);
  const report = buildWeeklyReport({
    tickets: [],
    previousTickets: [],
    now: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });
  const row = toWeeklyReportWrite({
    businessId,
    report,
    trigger,
    generatedAt: weekStart,
  });
  // Seeding bypasses the generation read; save directly on the fake.
  void store.saveReport(row);
  return report;
}

describe("ensureWeeklyReport", () => {
  function storeWithTickets(): FakeStore {
    const store = new FakeStore();
    store.tickets.set("biz_a", [
      ticket({ id: "w1", sentiment: "frustrated", intent: "refund_delay" }),
      ticket({
        id: "p1",
        sentiment: "distressed",
        intent: "refund_delay",
        createdAt: new Date("2026-10-14T09:00:00.000Z"),
      }),
    ]);
    return store;
  }

  it("writes the completed week once with a lazy trigger", async () => {
    const store = storeWithTickets();
    const result = await ensureWeeklyReport(store, "biz_a", now);

    assert.equal(result.created, true);
    assert.equal(store.saves.length, 1);
    const write = store.saves[0];
    assert.equal(write?.weekStart.toISOString(), COMPLETED_START);
    assert.equal(write?.weekEnd.toISOString(), COMPLETED_END);
    assert.equal(write?.generatedAt, now);
    assert.equal(write?.trigger, "lazy");
    assert.equal(write?.totalTickets, 1);
    assert.equal(write?.sentimentScore, 20);
    assert.equal(write?.previousScore, 0);
    assert.equal(write?.topComplaintIntent, null);
    assert.equal(result.report.totalTickets, 1);
    assert.equal(JSON.parse(write?.payloadJson ?? "{}").weekStart, COMPLETED_START);
  });

  it("asks for the previous week as well, so the trend has data", async () => {
    const store = storeWithTickets();
    await ensureWeeklyReport(store, "biz_a", now);
    assert.equal(store.ticketQueries.length, 1);
    assert.equal(store.ticketQueries[0]?.from.toISOString(), PREV_START);
    assert.equal(store.ticketQueries[0]?.to.toISOString(), COMPLETED_END);
  });

  it("returns the existing report without writing it again", async () => {
    const store = storeWithTickets();
    const first = await ensureWeeklyReport(store, "biz_a", now);
    const second = await ensureWeeklyReport(store, "biz_a", now);

    assert.equal(second.created, false);
    assert.equal(store.saves.length, 1);
    assert.equal(second.stored.id, first.stored.id);
    assert.equal(second.stored.generatedAt, first.stored.generatedAt);
    assert.deepEqual(second.report, first.report);
  });

  it("records a cron trigger when the scheduler owns the write", async () => {
    const store = storeWithTickets();
    await ensureWeeklyReport(store, "biz_a", now, "cron");
    assert.equal(store.saves[0]?.trigger, "cron");
  });
});

describe("generateWeeklyReportsForAll", () => {
  it("generates for every business and reports partial failures without aborting", async () => {
    const store = new FakeStore();
    store.businessIds = ["biz_a", "biz_b", "biz_c"];
    store.failing.add("biz_b");

    const sweep = await generateWeeklyReportsForAll(store, now);
    assert.equal(sweep.weekStart, COMPLETED_START);
    assert.equal(sweep.weekEnd, COMPLETED_END);
    assert.equal(sweep.businesses, 3);
    assert.equal(sweep.created, 2);
    assert.equal(sweep.existing, 0);
    assert.deepEqual(
      sweep.failures.map((failure) => failure.businessId),
      ["biz_b"],
    );
    assert.match(sweep.failures[0]?.message ?? "", /db down for biz_b/);
    assert.deepEqual(
      sweep.results.map((result) => [result.businessId, result.ok]),
      [
        ["biz_a", true],
        ["biz_b", false],
        ["biz_c", true],
      ],
    );
    assert.equal(
      store.saves.every((write) => write.trigger === "cron"),
      true,
    );
  });

  it("is idempotent on a second sweep", async () => {
    const store = new FakeStore();
    store.businessIds = ["biz_a", "biz_b"];
    const first = await generateWeeklyReportsForAll(store, now);
    const second = await generateWeeklyReportsForAll(store, now);
    assert.equal(first.created, 2);
    assert.equal(second.created, 0);
    assert.equal(second.existing, 2);
    assert.equal(store.saves.length, 2);
  });
});

describe("readWeeklyHistory", () => {
  it("returns newest-first parsed views with their provenance", async () => {
    const store = new FakeStore();
    store.businessIds = ["biz_a"];
    for (const week of [
      "2026-10-19T00:00:00.000Z",
      "2026-10-12T00:00:00.000Z",
      "2026-10-05T00:00:00.000Z",
      "2026-09-28T00:00:00.000Z",
      "2026-09-21T00:00:00.000Z",
    ]) {
      seedEmptyReport(store, "biz_a", week);
    }

    const history = await readWeeklyHistory(store, "biz_a", 4);
    assert.equal(history.length, 4);
    assert.deepEqual(
      history.map((view) => view.weekStart),
      [
        "2026-10-19T00:00:00.000Z",
        "2026-10-12T00:00:00.000Z",
        "2026-10-05T00:00:00.000Z",
        "2026-09-28T00:00:00.000Z",
      ],
    );
    assert.equal(history[0]?.trigger, "cron");
    assert.equal(typeof history[0]?.generatedAt, "string");
  });

  it("returns an empty list for a business with no reports", async () => {
    const store = new FakeStore();
    assert.deepEqual(await readWeeklyHistory(store, "biz_missing"), []);
  });
});

describe("parseStoredReport", () => {
  it("round-trips the write payload", () => {
    const report = buildWeeklyReport({
      tickets: [ticket({ id: "r1", sentiment: "positive" })],
      previousTickets: [],
      now,
    });
    const row: StoredWeeklyReportRow = {
      id: "wr_test",
      ...toWeeklyReportWrite({
        businessId: "biz_a",
        report,
        trigger: "lazy",
        generatedAt: now,
      }),
    };
    assert.deepEqual(parseStoredReport(row), report);
  });

  it("throws a labelled error instead of returning garbage", () => {
    const report = buildWeeklyReport({ tickets: [], previousTickets: [], now });
    const row: StoredWeeklyReportRow = {
      id: "wr_broken",
      ...toWeeklyReportWrite({
        businessId: "biz_a",
        report,
        trigger: "cron",
        generatedAt: now,
      }),
      payloadJson: "{not json",
    };
    assert.throws(() => parseStoredReport(row), /biz_a/);
  });
});

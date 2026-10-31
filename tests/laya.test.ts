import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  LAYA_SECRET_HEADER,
  fetchDecisionSheet,
  isLayaConfigured,
  parseDecisionSheet,
} from "../src/server/integrations/laya.ts";
import { fetchStub, jsonResponse, requestJson } from "./integrations-helpers.ts";

const ENV_KEYS = ["LAYA_SERVICE_URL", "LAYA_SERVICE_SECRET", "LAYA_TIMEOUT_MS"] as const;
const saved = new Map<string, string | undefined>();

function sheetBody(overrides: Record<string, unknown> = {}) {
  return {
    provider: "laya-mlx",
    model: "aac6fef/laya-typed-decisions-mlx",
    sheetVersion: 1,
    latencyMs: 14.2,
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
      {
        id: "urgency",
        kind: "score",
        title: "Urgency",
        verdict: "blocking issue or hard deadline",
        probability: 0.77,
        confidence: 0.77,
        value: 0.87,
        options: [
          { label: "no time pressure", probability: 0.03 },
          { label: "needs attention soon", probability: 0.2 },
          { label: "blocking issue or hard deadline", probability: 0.77 },
        ],
      },
      {
        id: "intent",
        kind: "choice",
        title: "Intent",
        verdict: "billing_question",
        probability: 0.72,
        confidence: 0.72,
        options: [
          { label: "refund", probability: 0.08 },
          { label: "billing_question", probability: 0.72 },
          { label: "other", probability: 0.2 },
        ],
      },
    ],
    ...overrides,
  };
}

before(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env.LAYA_SERVICE_URL = "http://127.0.0.1:8100";
  process.env.LAYA_SERVICE_SECRET = "laya-secret";
  process.env.LAYA_TIMEOUT_MS = "4000";
});

after(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Laya service configuration", () => {
  it("is configured only when both the URL and the secret exist", () => {
    assert.equal(isLayaConfigured(), true);

    delete process.env.LAYA_SERVICE_SECRET;
    assert.equal(isLayaConfigured(), false);
    process.env.LAYA_SERVICE_SECRET = "laya-secret";

    delete process.env.LAYA_SERVICE_URL;
    assert.equal(isLayaConfigured(), false);
    process.env.LAYA_SERVICE_URL = "http://127.0.0.1:8100";
  });

  it("reports a missing service instead of throwing", async () => {
    delete process.env.LAYA_SERVICE_URL;
    const fetch = fetchStub(() => jsonResponse(sheetBody()));

    const result = await fetchDecisionSheet("billed twice", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_configured");
    assert.equal(fetch.calls.length, 0, "an unconfigured service must not be called");
    process.env.LAYA_SERVICE_URL = "http://127.0.0.1:8100";
  });
});

describe("Laya service client", () => {
  it("sends the message with the shared secret and parses the sheet", async () => {
    const fetch = fetchStub(() => jsonResponse(sheetBody()));

    const result = await fetchDecisionSheet("I was billed twice.", fetch.impl);

    assert.equal(fetch.calls[0]?.url, "http://127.0.0.1:8100/decision-sheet");
    const headers = fetch.calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers[LAYA_SECRET_HEADER], "laya-secret");
    assert.deepEqual(requestJson(fetch.calls[0]), { message: "I was billed twice." });

    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.sheet.provider, "laya-mlx");
    assert.equal(result.sheet.decisions.length, 3);
    assert.equal(result.sheet.decisions[0]?.verdict, "urgent");
    assert.equal(result.sheet.decisions[1]?.value, 0.87);
  });

  it("tolerates a trailing slash on the configured URL", async () => {
    process.env.LAYA_SERVICE_URL = "http://127.0.0.1:8100/";
    const fetch = fetchStub(() => jsonResponse(sheetBody()));

    await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(fetch.calls[0]?.url, "http://127.0.0.1:8100/decision-sheet");
    process.env.LAYA_SERVICE_URL = "http://127.0.0.1:8100";
  });

  it("reports a service that is not running as unreachable", async () => {
    const fetch = fetchStub(() => {
      throw new TypeError("fetch failed");
    });

    const result = await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreachable");
  });

  it("reports a timeout as a timeout, not a generic failure", async () => {
    const fetch = fetchStub(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const result = await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "timeout");
  });

  it("surfaces the service's own refusal message", async () => {
    const fetch = fetchStub(() =>
      jsonResponse(
        { error: { code: "BAD_REQUEST", message: "'message' is longer than 4000 characters" } },
        400,
      ),
    );

    const result = await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "rejected");
    assert.match(result.ok === false ? result.message : "", /longer than 4000/);
  });

  it("reports a bare error status when the body carries no message", async () => {
    const fetch = fetchStub(() => new Response("upstream exploded", { status: 502 }));

    const result = await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "rejected");
    assert.match(result.ok === false ? result.message : "", /502/);
  });

  it("refuses a body that breaks the contract", async () => {
    const cases: unknown[] = [
      null,
      {},
      sheetBody({ provider: "some-other-model" }),
      sheetBody({ decisions: [] }),
      sheetBody({ sheetVersion: "1" }),
      sheetBody({ latencyMs: -1 }),
      sheetBody({ decisions: [{ ...sheetBody().decisions[0], kind: "ranking" }] }),
      sheetBody({ decisions: [{ ...sheetBody().decisions[0], probability: 1.4 }] }),
      sheetBody({ decisions: [{ ...sheetBody().decisions[0], options: [{ label: "", probability: 1 }] }] }),
      sheetBody({ decisions: [{ ...sheetBody().decisions[0], value: 2 }] }),
    ];

    for (const body of cases) {
      const fetch = fetchStub(() => jsonResponse(body));
      const result = await fetchDecisionSheet("hello", fetch.impl);
      assert.equal(result.ok, false, `expected ${JSON.stringify(body)} to be refused`);
      assert.equal(result.ok === false && result.reason, "invalid_response");
    }
  });

  it("treats a non-JSON success as an unexpected body", async () => {
    const fetch = fetchStub(() => new Response("<html>hello</html>", { status: 200 }));

    const result = await fetchDecisionSheet("hello", fetch.impl);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "invalid_response");
  });
});

describe("Decision sheet parsing", () => {
  it("keeps a decision without an optional level", () => {
    const sheet = parseDecisionSheet(sheetBody());
    assert.ok(sheet);
    assert.equal(sheet.decisions[0]?.value, undefined);
    assert.deepEqual(sheet.decisions[0]?.options, []);
  });

  it("accepts an empty option list only as an empty array", () => {
    const withoutOptions = sheetBody({
      decisions: [{ ...sheetBody().decisions[0], options: undefined }],
    });
    assert.equal(parseDecisionSheet(withoutOptions), null);
  });
});

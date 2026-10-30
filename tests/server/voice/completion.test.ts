import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  completionDecision,
  verifiedCitations,
  voiceMessageId,
} from "../../../src/server/voice/completion.ts";

const ownChunks = new Set(["chk_cp_02", "chk_cp_04"]);

describe("verifiedCitations", () => {
  it("drops a citation that belongs to another business", () => {
    assert.deepEqual(
      verifiedCitations(["chk_cp_02", "chk_nope", "chk_js_04"], ownChunks),
      ["chk_cp_02"],
    );
  });

  it("collapses a repeated id", () => {
    assert.deepEqual(verifiedCitations(["chk_cp_02", "chk_cp_02"], ownChunks), ["chk_cp_02"]);
  });

  it("keeps only string ids", () => {
    assert.deepEqual(verifiedCitations(["chk_cp_02", 7, null, { id: "chk_cp_04" }], ownChunks), [
      "chk_cp_02",
    ]);
  });

  it("answers nothing for a body that is not an array", () => {
    assert.deepEqual(verifiedCitations("chk_cp_02", ownChunks), []);
    assert.deepEqual(verifiedCitations(undefined, ownChunks), []);
  });

  it("verifies nothing when the business has no chunks", () => {
    assert.deepEqual(verifiedCitations(["chk_cp_02"], new Set<string>()), []);
  });
});

describe("voiceMessageId", () => {
  it("names the session, so one call is one idempotency key", () => {
    assert.equal(voiceMessageId("vsess_1"), "voice:vsess_1");
  });
});

describe("completionDecision", () => {
  it("escalates a caller who needed a human under R1", () => {
    assert.deepEqual(completionDecision({ escalate: true, grounded: true }), {
      actionStatus: "escalated",
      state: "escalated",
      rule: "R1",
    });
  });

  it("answers a grounded, resolved call under R6", () => {
    assert.deepEqual(completionDecision({ escalate: false, grounded: true }), {
      actionStatus: "answered",
      state: "replied",
      rule: "R6",
    });
  });

  it("escalates an ungrounded call under R2 — no verified chunk means it could not answer", () => {
    assert.deepEqual(completionDecision({ escalate: false, grounded: false }), {
      actionStatus: "escalated",
      state: "escalated",
      rule: "R2",
    });
  });
});

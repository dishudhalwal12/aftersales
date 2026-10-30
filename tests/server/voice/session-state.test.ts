import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ESCALATION_OUTCOMES,
  VOICE_STATUSES,
  callPlacementStatus,
  completionOutcome,
} from "../../../src/server/voice/session-state.ts";

describe("VOICE_STATUSES", () => {
  it("is exactly the enum PRD §3 freezes", () => {
    assert.deepEqual(VOICE_STATUSES, ["initiated", "ringing", "in_progress", "completed", "failed"]);
  });
});

describe("callPlacementStatus", () => {
  it("keeps a dry run inside the enum — the call mode, not the status, says no call was placed", () => {
    assert.equal(callPlacementStatus({ mode: "dry_run", ok: true }, "initiated"), "initiated");
  });

  it("keeps a placed call at initiated until the platform reports progress", () => {
    assert.equal(callPlacementStatus({ mode: "live", ok: true }, "initiated"), "initiated");
  });

  it("records a rejected call request as failed, never as a success", () => {
    assert.equal(callPlacementStatus({ mode: "live", ok: false }, "initiated"), "failed");
  });

  it("only ever returns a frozen status", () => {
    for (const mode of ["live", "dry_run"] as const) {
      for (const ok of [true, false]) {
        const status = callPlacementStatus({ mode, ok }, "initiated");
        assert.ok(VOICE_STATUSES.includes(status), `${status} is outside the enum`);
      }
    }
  });
});

describe("completionOutcome", () => {
  it("records a caller who needed a human as escalated to the owner", () => {
    assert.equal(
      completionOutcome({ escalate: true, status: "completed", grounded: true }),
      "escalated_to_owner",
    );
  });

  it("records a resolved call as resolved by the agent", () => {
    assert.equal(
      completionOutcome({ escalate: false, status: "completed", grounded: true }),
      "resolved_by_ai",
    );
  });

  it("treats a failed call as work the owner must pick up", () => {
    assert.equal(
      completionOutcome({ escalate: false, status: "failed", grounded: true }),
      "escalated_to_owner",
    );
  });

  it("never calls an ungrounded call resolved — the owner still has to answer it", () => {
    assert.equal(
      completionOutcome({ escalate: false, status: "completed", grounded: false }),
      "escalated_to_owner",
    );
  });

  it("only ever returns a frozen outcome", () => {
    for (const status of VOICE_STATUSES) {
      for (const escalate of [true, false]) {
        for (const grounded of [true, false]) {
          const outcome = completionOutcome({ escalate, status, grounded });
          assert.ok(ESCALATION_OUTCOMES.includes(outcome), `${outcome} is outside the enum`);
        }
      }
    }
  });
});

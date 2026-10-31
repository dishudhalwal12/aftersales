import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isDatabaseUnavailable, withDatabaseFallback } from "../../src/server/db-errors.ts";

describe("isDatabaseUnavailable", () => {
  it("recognises a wrong password or an unreachable host", () => {
    // Measured shape: Prisma raises this with no `code` at all, so classifying
    // by code alone would report a credentials failure as an application bug.
    const initError = Object.assign(new Error("Can't reach database server"), {
      name: "PrismaClientInitializationError",
      clientVersion: "6.16.2",
      errorCode: undefined,
      retryable: false,
    });
    assert.equal(isDatabaseUnavailable(initError), true);
  });

  it("recognises a database whose tables were never created", () => {
    const missingTable = Object.assign(new Error("The table `public.User` does not exist"), {
      code: "P2021",
    });
    assert.equal(isDatabaseUnavailable(missingTable), true);
  });

  it("leaves an application bug to surface as a real error", () => {
    assert.equal(isDatabaseUnavailable(new Error("Unique constraint failed")), false);
    assert.equal(isDatabaseUnavailable({ code: "P2002" }), false);
    assert.equal(isDatabaseUnavailable({ code: 42 }), false);
    assert.equal(isDatabaseUnavailable(null), false);
    assert.equal(isDatabaseUnavailable(undefined), false);
    assert.equal(isDatabaseUnavailable("P2021"), false);
  });
});

describe("withDatabaseFallback", () => {
  // Measured shape from the incident: a session lookup on a sleeping Supabase
  // project raised this with no `code`, and the raw error replaced the sign-in
  // screen with a stack trace.
  const unreachable = () =>
    Object.assign(new Error("Can't reach database server at `aws-0-eu-west-1.pooler.supabase.com:6543`"), {
      name: "PrismaClientInitializationError",
      clientVersion: "6.19.3",
      retryable: false,
    });

  it("returns the lookup's value when the database answers", async () => {
    let fallbackUsed = false;
    const value = await withDatabaseFallback(null, async () => {
      fallbackUsed = false;
      return { id: "usr_1" };
    });
    assert.deepEqual(value, { id: "usr_1" });
    assert.equal(fallbackUsed, false);
  });

  it("falls back to the given value when the database cannot be reached", async () => {
    const value = await withDatabaseFallback(null, async () => {
      throw unreachable();
    });
    assert.equal(value, null);
  });

  it("falls back when the schema is behind the code", async () => {
    const value = await withDatabaseFallback([], async () => {
      throw Object.assign(new Error("The table `public.User` does not exist"), { code: "P2021" });
    });
    assert.deepEqual(value, []);
  });

  it("rethrows a genuine bug instead of disguising it as an outage", async () => {
    const bug = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    await assert.rejects(
      () => withDatabaseFallback(null, async () => {
        throw bug;
      }),
      (error: Error) => error === bug,
    );
  });
});

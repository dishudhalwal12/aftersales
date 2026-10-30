import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isDatabaseUnavailable } from "../../src/server/db-errors.ts";

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

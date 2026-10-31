import { describe, expect, it } from "vitest";

import { createBaileysLogger, type Logger } from "../src/config";

function recorder() {
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const logger: Logger = {
    debug: (...args) => calls.push({ level: "debug", args }),
    info: (...args) => calls.push({ level: "info", args }),
    warn: (...args) => calls.push({ level: "warn", args }),
    error: (...args) => calls.push({ level: "error", args }),
  };
  return { calls, logger };
}

describe("createBaileysLogger", () => {
  it("forwards library warnings so protocol failures are visible", () => {
    const { calls, logger } = recorder();
    createBaileysLogger(logger).warn("Failed to decrypt message");
    expect(calls).toEqual([{ level: "warn", args: ["baileys", "Failed to decrypt message"] }]);
  });

  it("forwards errors and returns itself from child()", () => {
    const { calls, logger } = recorder();
    const adapter = createBaileysLogger(logger);
    adapter.error({ reason: "stream error" });
    adapter.child().fatal?.("socket closed");
    expect(calls[0]).toEqual({ level: "error", args: ["baileys", { reason: "stream error" }] });
    expect(calls[1]).toEqual({ level: "error", args: ["baileys", "socket closed"] });
  });

  it("stays silent for debug/info so credentials never reach the log", () => {
    const { calls, logger } = recorder();
    const adapter = createBaileysLogger(logger);
    adapter.info("qr", "secret-pairing-payload");
    adapter.debug("creds");
    expect(calls).toHaveLength(0);
  });
});

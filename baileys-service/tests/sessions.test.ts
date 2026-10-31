import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listSavedSessions, shouldPersistSession, writeSessionMeta } from "../src/sessions";

async function workspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "baileys-sessions-"));
}

describe("session metadata", () => {
  it("round-trips a saved business so the connection can resume without a QR", async () => {
    const root = await workspace();
    await mkdir(path.join(root, "wa_abc12345"), { recursive: true });
    await writeFile(path.join(root, "wa_abc12345", "creds.json"), "{}", "utf8");
    await writeSessionMeta(root, "wa_abc12345", { businessId: "biz_12345678", phoneNumber: "919812345678" });
    expect(await listSavedSessions(root)).toEqual([
      { connectionId: "wa_abc12345", businessId: "biz_12345678" },
    ]);
  });

  it("ignores metadata without credentials: a logged-out folder must never resurrect", async () => {
    const root = await workspace();
    await writeSessionMeta(root, "wa_loggedout1", { businessId: "biz_12345678", phoneNumber: null });
    expect(await listSavedSessions(root)).toEqual([]);
  });

  it("persists metadata only when a real pairing exists", () => {
    expect(shouldPersistSession("connected")).toBe(true);
    for (const status of ["qr", "connecting", "disconnected", "logged_out"]) {
      expect(shouldPersistSession(status)).toBe(false);
    }
  });

  it("skips folders without usable metadata", async () => {
    const root = await workspace();
    await mkdir(path.join(root, "wa_nometa"), { recursive: true });
    await mkdir(path.join(root, "wa_broken"), { recursive: true });
    await writeFile(path.join(root, "wa_broken", "meta.json"), "{not json", "utf8");
    await writeFile(path.join(root, "wa_broken", "creds.json"), "{}", "utf8");
    await mkdir(path.join(root, "wa_good1234"), { recursive: true });
    await writeFile(path.join(root, "wa_good1234", "creds.json"), "{}", "utf8");
    await writeSessionMeta(root, "wa_good1234", { businessId: "biz_87654321", phoneNumber: null });
    expect(await listSavedSessions(root)).toEqual([
      { connectionId: "wa_good1234", businessId: "biz_87654321" },
    ]);
  });

  it("returns nothing when the storage folder does not exist yet", async () => {
    expect(await listSavedSessions(path.join(tmpdir(), "missing-baileys-root"))).toEqual([]);
  });
});

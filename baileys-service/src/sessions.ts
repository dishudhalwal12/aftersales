// Session bookkeeping: which business owns a saved credential folder.
//
// Baileys writes the credentials; this file adds the one fact the service needs
// after a restart — the businessId — so every saved session can be resumed
// without a QR scan or a dashboard click.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const META_FILE = "meta.json";
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export type SessionMeta = {
  businessId: string;
  phoneNumber: string | null;
};

export type SavedSession = {
  connectionId: string;
  businessId: string;
};

function metaPath(root: string, connectionId: string): string {
  return path.join(root, connectionId, META_FILE);
}

function credsPath(root: string, connectionId: string): string {
  return path.join(root, connectionId, "creds.json");
}

/**
 * Only a paired device is worth resuming. A QR that was never scanned, or a
 * session the owner logged out, must not come back as a socket on boot.
 */
export function shouldPersistSession(status: string): boolean {
  return status === "connected";
}

/** Persist the business for a connection. Never contains credential material. */
export async function writeSessionMeta(
  root: string,
  connectionId: string,
  meta: SessionMeta
): Promise<void> {
  if (!ID_PATTERN.test(connectionId)) return;
  if (!ID_PATTERN.test(meta.businessId)) return;
  await mkdir(path.join(root, connectionId), { recursive: true });
  await writeFile(metaPath(root, connectionId), `${JSON.stringify(meta)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Every saved session that names a valid business, in folder order. */
export async function listSavedSessions(root: string): Promise<SavedSession[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const saved: SavedSession[] = [];
  for (const entry of entries.sort()) {
    if (!ID_PATTERN.test(entry)) continue;
    try {
      // Credentials are the real proof of pairing; metadata alone is a
      // leftover and must not open a socket.
      await readFile(credsPath(root, entry), "utf8");
      const raw = await readFile(metaPath(root, entry), "utf8");
      const parsed = JSON.parse(raw) as { businessId?: unknown };
      if (typeof parsed.businessId !== "string" || !ID_PATTERN.test(parsed.businessId)) continue;
      saved.push({ connectionId: entry, businessId: parsed.businessId });
    } catch {
      // A folder without readable metadata was never paired through this
      // service; it is not resumable and must not block the others.
    }
  }
  return saved;
}

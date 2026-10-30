import { vi } from "vitest";

import type { AuthState } from "../src/baileys-adapter";
import type {
  ConnectionManagerApi,
  ConnectionSnapshot,
  WASocketLike,
} from "../src/types";

type Listener = (...args: unknown[]) => void;

// Minimal stand-in for a Baileys socket. Tests emit connection/message events
// themselves and inspect what the manager tried to send.
export class FakeSocket implements WASocketLike {
  readonly listeners = new Map<string, Listener[]>();
  readonly sent: Array<{ jid: string; text: string }> = [];
  ended = false;
  loggedOut = false;
  user: { id?: string | null } | null = { id: "919812345678:3@s.whatsapp.net" };

  ev = {
    on: (event: string, listener: Listener) => {
      const existing = this.listeners.get(event) ?? [];
      existing.push(listener);
      this.listeners.set(event, existing);
    },
  };

  sendMessage = async (jid: string, content: { text: string }) => {
    if (this.ended) throw new Error("socket closed");
    this.sent.push({ jid, text: content.text });
    return { key: { id: `out_${this.sent.length}` } };
  };

  end = () => {
    this.ended = true;
  };

  logout = async () => {
    this.loggedOut = true;
  };

  emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

export const fakeAuth: AuthState = {
  state: {} as never,
  saveCreds: async () => {},
};

// The manager handles socket events asynchronously; wait for the microtask and
// macrotask queues to settle before asserting.
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function snapshot(overrides: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot {
  return {
    connectionId: "wa_connection_01",
    businessId: "biz_test_01",
    status: "qr",
    qr: "data:image/png;base64,qr",
    qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    connectedAt: null,
    phoneNumber: null,
    lastError: null,
    ...overrides,
  };
}

export type FakeManager = ConnectionManagerApi & {
  start: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  stats: ReturnType<typeof vi.fn>;
};

export function createFakeManager(): FakeManager {
  return {
    start: vi.fn(async () => snapshot()),
    get: vi.fn(() => snapshot()),
    disconnect: vi.fn(async () => snapshot({ status: "logged_out", qr: null })),
    send: vi.fn(async () => ({ messageId: "msg_123" })),
    stats: vi.fn(() => ({ total: 1, connected: 0 })),
    shutdown: vi.fn(async () => {}),
  } as FakeManager;
}

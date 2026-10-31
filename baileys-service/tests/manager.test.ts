import { describe, expect, it } from "vitest";

import { silentLogger, type Logger } from "../src/config";
import { ConnectionManager } from "../src/connection-manager";
import type { InboundMessage, StatusEvent } from "../src/types";
import { FakeSocket, fakeAuth, flush } from "./helpers";

const ID = "wa_connection_01";
const BIZ = "biz_test_01";

function recordingLogger(lines: Array<Record<string, unknown>>): Logger {
  const record = (...args: unknown[]) => {
    const detail = args.find((arg) => typeof arg === "object" && arg !== null);
    if (detail) lines.push(detail as Record<string, unknown>);
  };
  return { debug: record, info: record, warn: record, error: record };
}

function createHarness(overrides: { dedupeLimit?: number; logger?: Logger } = {}) {
  const sockets: FakeSocket[] = [];
  const removed: string[] = [];
  const statuses: StatusEvent[] = [];
  const inbound: InboundMessage[] = [];

  const manager = new ConnectionManager({
    loadAuthState: async () => fakeAuth,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    removeSession: async (connectionId) => {
      removed.push(connectionId);
    },
    encodeQr: async (qr) => `data:image/png;base64,${qr}`,
    logger: overrides.logger ?? silentLogger,
    connectWaitMs: 30,
    reconnectMaxDelayMs: 20,
    dedupeLimit: overrides.dedupeLimit,
    hooks: {
      onInbound: (message) => {
        inbound.push(message);
      },
      onStatus: (event) => {
        statuses.push(event);
      },
    },
  });

  return { manager, sockets, removed, statuses, inbound };
}

async function connect(manager: ConnectionManager, sockets: FakeSocket[]) {
  const started = manager.start(ID, BIZ);
  await flush();
  sockets[0].emit("connection.update", { qr: "qr-payload" });
  await started;
  sockets[0].emit("connection.update", { connection: "open" });
  await flush();
}

describe("ConnectionManager", () => {
  it("returns a QR code and only creates one socket per connection", async () => {
    const { manager, sockets } = createHarness();

    const started = manager.start(ID, BIZ);
    await flush();
    sockets[0].emit("connection.update", { qr: "qr-payload" });
    const snapshot = await started;

    expect(snapshot.status).toBe("qr");
    expect(snapshot.qr).toBe("data:image/png;base64,qr-payload");

    const again = await manager.start(ID, BIZ);
    expect(again.connectionId).toBe(ID);
    expect(sockets).toHaveLength(1);
    await manager.shutdown();
  });

  it("marks the connection connected and reports the phone number", async () => {
    const { manager, sockets, statuses } = createHarness();
    await connect(manager, sockets);

    const snapshot = manager.get(ID);
    expect(snapshot?.status).toBe("connected");
    expect(snapshot?.phoneNumber).toBe("919812345678");
    expect(snapshot?.connectedAt).not.toBeNull();
    expect(statuses.at(-1)?.status).toBe("connected");
    await manager.shutdown();
  });

  it("refuses to reuse a connection for another business", async () => {
    const { manager, sockets } = createHarness();
    await manager.start(ID, BIZ);
    await expect(manager.start(ID, "biz_other_01")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(sockets).toHaveLength(1);
    await manager.shutdown();
  });

  it("reconnects after an unexpected close", async () => {
    const { manager, sockets, statuses } = createHarness();
    await connect(manager, sockets);

    sockets[0].emit("connection.update", {
      connection: "close",
      lastDisconnect: { error: { output: { statusCode: 428 } } },
    });
    await flush();
    expect(manager.get(ID)?.status).toBe("disconnected");
    expect(statuses.at(-1)?.status).toBe("disconnected");

    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(sockets.length).toBeGreaterThanOrEqual(2);
    expect(manager.get(ID)?.status).toBe("connecting");
    await manager.shutdown();
  });

  it("does not reconnect when WhatsApp logs the device out", async () => {
    const { manager, sockets, removed } = createHarness();
    await connect(manager, sockets);

    sockets[0].emit("connection.update", {
      connection: "close",
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    await flush();
    expect(manager.get(ID)?.status).toBe("logged_out");
    expect(removed).toEqual([ID]);

    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(sockets).toHaveLength(1);
    await manager.shutdown();
  });

  it("logs out and removes credentials only when asked", async () => {
    const { manager, sockets, removed } = createHarness();
    await connect(manager, sockets);

    const snapshot = await manager.disconnect(ID, BIZ, { logout: true });
    expect(snapshot.status).toBe("logged_out");
    expect(sockets[0].loggedOut).toBe(true);
    expect(removed).toEqual([ID]);
    await manager.shutdown();
  });

  it("closes the socket without removing credentials when logout is false", async () => {
    const { manager, sockets, removed } = createHarness();
    await connect(manager, sockets);

    const snapshot = await manager.disconnect(ID, BIZ, { logout: false });
    expect(snapshot.status).toBe("disconnected");
    expect(sockets[0].ended).toBe(true);
    expect(removed).toEqual([]);
    await manager.shutdown();
  });

  it("sends through the right connection and blocks cross-business sends", async () => {
    const { manager, sockets } = createHarness();
    await connect(manager, sockets);

    const result = await manager.send(ID, BIZ, "+91 97000 00001", "Your answer");
    expect(result.messageId).toBe("out_1");
    expect(sockets[0].sent).toEqual([
      { jid: "919700000001@s.whatsapp.net", text: "Your answer" },
    ]);

    await expect(
      manager.send(ID, "biz_other_01", "919700000001", "nope")
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    await expect(
      manager.send("wa_unknown_01", BIZ, "919700000001", "nope")
    ).rejects.toMatchObject({ status: 404, code: "CONNECTION_NOT_FOUND" });
    await manager.shutdown();
  });

  it("rejects sends while disconnected, invalid recipients and empty messages", async () => {
    const { manager, sockets } = createHarness();
    await expect(
      manager.send(ID, BIZ, "919700000001", "hello")
    ).rejects.toMatchObject({ status: 404 });

    await connect(manager, sockets);

    await expect(
      manager.send(ID, BIZ, "not-a-phone", "hello")
    ).rejects.toMatchObject({ status: 400, code: "INVALID_RECIPIENT" });
    await expect(
      manager.send(ID, BIZ, "919700000001", "   ")
    ).rejects.toMatchObject({ status: 400, code: "INVALID_MESSAGE" });

    const failed = createHarness();
    await connect(failed.manager, failed.sockets);
    failed.sockets[0].sendMessage = async () => {
      throw new Error("socket gone");
    };
    await expect(
      failed.manager.send(ID, BIZ, "919700000001", "hello")
    ).rejects.toMatchObject({ status: 502, code: "WHATSAPP_SEND_FAILED" });
    await manager.shutdown();
    await failed.manager.shutdown();
  });

  it("forwards each incoming text message exactly once", async () => {
    const { manager, sockets, inbound } = createHarness();
    await connect(manager, sockets);

    const raw = {
      key: { id: "WAMID_1", remoteJid: "919700000001@s.whatsapp.net", fromMe: false },
      message: { conversation: "Do you deliver?" },
      messageTimestamp: 1_730_000_000,
    };

    sockets[0].emit("messages.upsert", {
      type: "notify",
      messages: [
        raw,
        raw,
        {
          key: { id: "WAMID_SELF", remoteJid: "919812345678@s.whatsapp.net", fromMe: true },
          message: { conversation: "our own reply" },
        },
      ],
    });
    await flush();

    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({
      connectionId: ID,
      messageId: "WAMID_1",
      text: "Do you deliver?",
      direction: "inbound",
    });

    // History syncs and status updates are ignored.
    sockets[0].emit("messages.upsert", { type: "append", messages: [raw] });
    await flush();
    expect(inbound).toHaveLength(1);
    await manager.shutdown();
  });

  it("logs why a message was skipped instead of dropping it silently", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const { manager, sockets, inbound } = createHarness({ logger: recordingLogger(lines) });
    await connect(manager, sockets);

    sockets[0].emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: { id: "WAMID_SELF", remoteJid: "919812345678@s.whatsapp.net", fromMe: true },
          message: { conversation: "our own outgoing message" },
          messageTimestamp: 1_730_000_000,
        },
      ],
    });
    await flush();

    expect(inbound).toHaveLength(0);
    expect(lines.some((line) => line.reason === "fromMe")).toBe(true);
  });


  it("shuts every socket down", async () => {
    const { manager, sockets } = createHarness();
    await connect(manager, sockets);
    await manager.shutdown();
    expect(sockets[0].ended).toBe(true);
    expect(manager.stats()).toEqual({ total: 0, connected: 0 });
  });
});

// Owns every WhatsApp socket. One record per connectionId, credentials loaded
// from that connection's own folder, and failures isolated per connection.

import type { AuthState } from "./baileys-adapter";
import type { Logger } from "./config";
import { DedupeCache } from "./dedupe";
import {
  ForbiddenError,
  HttpError,
  NotFoundError,
  NotConnectedError,
  UpstreamError,
} from "./errors";
import { extractInboundMessage } from "./inbound";
import type {
  ConnectionManagerApi,
  ConnectionSnapshot,
  ConnectionStatus,
  InboundMessage,
  RawConnectionUpdate,
  RawWaMessage,
  SendResult,
  StatusEvent,
  WASocketLike,
} from "./types";

type MessagesUpsert = {
  type?: string;
  messages?: RawWaMessage[];
};

type Waiter = { resolve: () => void };

type ConnectionRecord = {
  connectionId: string;
  businessId: string;
  status: ConnectionStatus;
  qr: string | null;
  qrExpiresAt: Date | null;
  connectedAt: Date | null;
  phoneNumber: string | null;
  lastError: string | null;
  socket: WASocketLike | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  stopped: boolean;
  dedupe: DedupeCache;
  waiters: Waiter[];
};

export type ConnectionManagerHooks = {
  onInbound?: (message: InboundMessage) => void | Promise<unknown>;
  onStatus?: (event: StatusEvent) => void | Promise<unknown>;
};

export type ConnectionManagerOptions = {
  loadAuthState: (connectionId: string) => Promise<AuthState>;
  createSocket: (params: {
    connectionId: string;
    auth: AuthState;
  }) => WASocketLike;
  removeSession: (connectionId: string) => Promise<void>;
  encodeQr: (qr: string) => Promise<string>;
  logger: Logger;
  hooks?: ConnectionManagerHooks;
  connectWaitMs?: number;
  reconnectMaxDelayMs?: number;
  dedupeLimit?: number;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_MESSAGE_LENGTH = 4096;
const QR_TTL_MS = 60_000;

function assertId(value: string, field: string): void {
  if (!ID_PATTERN.test(value)) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      `${field} must be 8-80 characters of letters, digits, "_" or "-".`
    );
  }
}

// WhatsApp JIDs look like 919812345678:12@s.whatsapp.net; strip the device
// suffix when reporting a phone number.
export function phoneFromUser(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const bare = userId.split("@")[0]?.split(":")[0] ?? "";
  return /^\d{6,15}$/.test(bare) ? bare : null;
}

// Accepts "919812345678", "+91 98123 45678" or a full JID and returns the
// canonical 1:1 JID. Returns null when there is no plausible phone number.
export function normalizeRecipient(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{8,15}@s\.whatsapp\.net$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `${digits}@s.whatsapp.net`;
}

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const output = (error as { output?: { statusCode?: unknown } }).output;
  const code = output?.statusCode ?? (error as { statusCode?: unknown }).statusCode;
  return typeof code === "number" ? code : null;
}

function errorMessageOf(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return null;
}

export class ConnectionManager implements ConnectionManagerApi {
  private readonly records = new Map<string, ConnectionRecord>();
  private readonly options: Required<
    Pick<ConnectionManagerOptions, "connectWaitMs" | "reconnectMaxDelayMs">
  > &
    ConnectionManagerOptions;

  constructor(options: ConnectionManagerOptions) {
    this.options = {
      ...options,
      connectWaitMs: options.connectWaitMs ?? 10_000,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 30_000,
    };
  }

  async start(connectionId: string, businessId: string): Promise<ConnectionSnapshot> {
    assertId(connectionId, "connectionId");
    assertId(businessId, "businessId");

    let record = this.records.get(connectionId);
    if (record) {
      if (record.businessId !== businessId) throw new ForbiddenError();
      if (record.socket && record.status !== "logged_out") {
        // Already connecting/connected: never create a second socket.
        return this.snapshot(record);
      }
      record.stopped = false;
      record.status = "connecting";
      record.qr = null;
      record.qrExpiresAt = null;
      record.lastError = null;
      record.reconnectAttempts = 0;
    } else {
      record = {
        connectionId,
        businessId,
        status: "connecting",
        qr: null,
        qrExpiresAt: null,
        connectedAt: null,
        phoneNumber: null,
        lastError: null,
        socket: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        stopped: false,
        dedupe: new DedupeCache(this.options.dedupeLimit),
        waiters: [],
      };
      this.records.set(connectionId, record);
    }

    try {
      await this.openSocket(record);
    } catch (error) {
      record.status = "disconnected";
      record.stopped = true;
      record.lastError = errorMessageOf(error) ?? "Could not open the WhatsApp socket.";
      throw new HttpError(502, "WHATSAPP_CONNECT_FAILED", record.lastError);
    }

    await this.waitForSettled(record);
    return this.snapshot(record);
  }

  get(connectionId: string): ConnectionSnapshot | null {
    const record = this.records.get(connectionId);
    return record ? this.snapshot(record) : null;
  }

  async disconnect(
    connectionId: string,
    businessId: string,
    options: { logout?: boolean } = {}
  ): Promise<ConnectionSnapshot> {
    const record = this.records.get(connectionId);
    if (!record) throw new NotFoundError();
    if (record.businessId !== businessId) throw new ForbiddenError();

    record.stopped = true;
    if (record.reconnectTimer) {
      clearTimeout(record.reconnectTimer);
      record.reconnectTimer = null;
    }

    const socket = record.socket;
    record.socket = null;

    if (options.logout && socket?.logout) {
      try {
        await socket.logout();
      } catch (error) {
        this.options.logger.warn("logout failed; closing socket anyway", {
          connectionId,
          error: errorMessageOf(error),
        });
      }
    } else {
      socket?.end?.();
    }

    if (options.logout) {
      try {
        await this.options.removeSession(connectionId);
      } catch (error) {
        this.options.logger.warn("could not remove session folder", {
          connectionId,
          error: errorMessageOf(error),
        });
      }
    }

    record.status = options.logout ? "logged_out" : "disconnected";
    record.qr = null;
    record.qrExpiresAt = null;
    record.connectedAt = null;
    record.lastError = null;
    this.resolveWaiters(record);
    this.notifyStatus(record);
    return this.snapshot(record);
  }

  async send(
    connectionId: string,
    businessId: string,
    recipient: string,
    message: string
  ): Promise<SendResult> {
    const record = this.records.get(connectionId);
    if (!record) throw new NotFoundError();
    if (record.businessId !== businessId) throw new ForbiddenError();

    if (record.status !== "connected" || !record.socket) {
      throw new NotConnectedError();
    }

    const jid = normalizeRecipient(recipient);
    if (!jid) {
      throw new HttpError(
        400,
        "INVALID_RECIPIENT",
        "recipient must be a phone number with country code."
      );
    }

    const text = message.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      throw new HttpError(
        400,
        "INVALID_MESSAGE",
        `message must be 1-${MAX_MESSAGE_LENGTH} characters.`
      );
    }

    try {
      const result = await record.socket.sendMessage(jid, { text });
      return { messageId: result?.key?.id ?? "" };
    } catch (error) {
      this.options.logger.error("send failed", {
        connectionId,
        error: errorMessageOf(error),
      });
      throw new UpstreamError();
    }
  }

  stats(): { total: number; connected: number } {
    let connected = 0;
    for (const record of this.records.values()) {
      if (record.status === "connected") connected += 1;
    }
    return { total: this.records.size, connected };
  }

  async shutdown(): Promise<void> {
    for (const record of this.records.values()) {
      record.stopped = true;
      if (record.reconnectTimer) {
        clearTimeout(record.reconnectTimer);
        record.reconnectTimer = null;
      }
      record.socket?.end?.();
      record.socket = null;
      this.resolveWaiters(record);
    }
    this.records.clear();
  }

  private async openSocket(record: ConnectionRecord): Promise<void> {
    record.stopped = false;
    const auth = await this.options.loadAuthState(record.connectionId);
    const socket = this.options.createSocket({
      connectionId: record.connectionId,
      auth,
    });
    record.socket = socket;

    socket.ev.on("creds.update", () => {
      void Promise.resolve(auth.saveCreds()).catch((error: unknown) => {
        this.options.logger.warn("could not persist credentials", {
          connectionId: record.connectionId,
          error: errorMessageOf(error),
        });
      });
    });

    socket.ev.on("connection.update", (update: unknown) => {
      void this.handleConnectionUpdate(record, update as RawConnectionUpdate).catch(
        (error: unknown) => {
          this.options.logger.error("connection update failed", {
            connectionId: record.connectionId,
            error: errorMessageOf(error),
          });
        }
      );
    });

    socket.ev.on("messages.upsert", (upsert: unknown) => {
      this.handleMessagesUpsert(record, upsert as MessagesUpsert);
    });
  }

  private async handleConnectionUpdate(
    record: ConnectionRecord,
    update: RawConnectionUpdate
  ): Promise<void> {
    if (update.qr) {
      try {
        record.qr = await this.options.encodeQr(update.qr);
      } catch (error) {
        record.qr = null;
        record.lastError = "Could not render the WhatsApp QR code.";
        this.options.logger.error("qr encoding failed", {
          connectionId: record.connectionId,
          error: errorMessageOf(error),
        });
      }
      record.status = "qr";
      record.qrExpiresAt = new Date(Date.now() + QR_TTL_MS);
      record.lastError = record.qr ? null : record.lastError;
      this.resolveWaiters(record);
      return;
    }

    if (update.connection === "open") {
      record.status = "connected";
      record.qr = null;
      record.qrExpiresAt = null;
      record.connectedAt = new Date();
      record.phoneNumber = phoneFromUser(record.socket?.user?.id);
      record.lastError = null;
      record.reconnectAttempts = 0;
      this.resolveWaiters(record);
      this.notifyStatus(record);
      return;
    }

    if (update.connection === "close") {
      const statusCode = statusCodeOf(update.lastDisconnect?.error);
      const loggedOut = statusCode === 401;
      record.socket = null;
      record.qr = null;
      record.qrExpiresAt = null;
      record.connectedAt = null;
      record.status = loggedOut ? "logged_out" : "disconnected";
      record.lastError =
        errorMessageOf(update.lastDisconnect?.error) ??
        `WhatsApp closed the connection (${statusCode ?? "unknown"}).`;
      this.resolveWaiters(record);
      this.notifyStatus(record);

      if (loggedOut) {
        try {
          await this.options.removeSession(record.connectionId);
        } catch (error) {
          this.options.logger.warn("could not remove logged-out session", {
            connectionId: record.connectionId,
            error: errorMessageOf(error),
          });
        }
        return;
      }

      this.scheduleReconnect(record);
    }
  }

  private handleMessagesUpsert(record: ConnectionRecord, upsert: MessagesUpsert): void {
    // "notify" is a fresh incoming message; history/appends are ignored.
    if (upsert.type !== "notify" || !Array.isArray(upsert.messages)) return;

    for (const raw of upsert.messages) {
      const message = extractInboundMessage(
        { connectionId: record.connectionId, phoneNumber: record.phoneNumber },
        raw
      );
      if (!message) continue;
      if (!record.dedupe.add(message.messageId)) {
        this.options.logger.debug("skipping duplicate message", {
          connectionId: record.connectionId,
          messageId: message.messageId,
        });
        continue;
      }

      const hook = this.options.hooks?.onInbound;
      if (!hook) continue;
      void Promise.resolve(hook(message)).catch((error: unknown) => {
        this.options.logger.error("inbound forwarding failed", {
          connectionId: record.connectionId,
          messageId: message.messageId,
          error: errorMessageOf(error),
        });
      });
    }
  }

  private scheduleReconnect(record: ConnectionRecord): void {
    if (record.stopped || record.reconnectTimer || !this.records.has(record.connectionId)) {
      return;
    }

    record.reconnectAttempts += 1;
    const exponent = Math.min(record.reconnectAttempts - 1, 5);
    const delay = Math.min(1000 * 2 ** exponent, this.options.reconnectMaxDelayMs);
    this.options.logger.warn("reconnecting WhatsApp socket", {
      connectionId: record.connectionId,
      attempt: record.reconnectAttempts,
      delayMs: delay,
    });

    record.reconnectTimer = setTimeout(() => {
      record.reconnectTimer = null;
      if (record.stopped) return;
      record.status = "connecting";
      record.lastError = null;
      this.openSocket(record).catch((error: unknown) => {
        record.status = "disconnected";
        record.lastError = errorMessageOf(error) ?? "Reconnect failed.";
        this.options.logger.error("reconnect failed", {
          connectionId: record.connectionId,
          error: record.lastError,
        });
        this.scheduleReconnect(record);
      });
    }, delay);
  }

  private waitForSettled(record: ConnectionRecord): Promise<void> {
    if (
      record.status === "qr" ||
      record.status === "connected" ||
      record.status === "logged_out" ||
      record.status === "disconnected"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let waiter: Waiter;
      const timer = setTimeout(() => {
        record.waiters = record.waiters.filter((entry) => entry !== waiter);
        resolve();
      }, this.options.connectWaitMs);

      waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      record.waiters.push(waiter);
    });
  }

  private resolveWaiters(record: ConnectionRecord): void {
    const waiters = record.waiters;
    record.waiters = [];
    for (const waiter of waiters) waiter.resolve();
  }

  private notifyStatus(record: ConnectionRecord): void {
    const hook = this.options.hooks?.onStatus;
    if (!hook) return;

    const event: StatusEvent = {
      connectionId: record.connectionId,
      businessId: record.businessId,
      status: record.status,
      phoneNumber: record.phoneNumber,
      lastError: record.lastError,
    };

    void Promise.resolve(hook(event)).catch((error: unknown) => {
      this.options.logger.error("status webhook failed", {
        connectionId: record.connectionId,
        error: errorMessageOf(error),
      });
    });
  }

  private snapshot(record: ConnectionRecord): ConnectionSnapshot {
    return {
      connectionId: record.connectionId,
      businessId: record.businessId,
      status: record.status,
      qr: record.qr,
      qrExpiresAt: record.qrExpiresAt?.toISOString() ?? null,
      connectedAt: record.connectedAt?.toISOString() ?? null,
      phoneNumber: record.phoneNumber,
      lastError: record.lastError,
    };
  }
}

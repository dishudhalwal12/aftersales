// Shared types for the local Baileys service. Baileys internals are hidden
// behind small interfaces so the connection manager can be tested with fake
// sockets and without a real WhatsApp account.

export const CONNECTION_STATUSES = [
  "connecting",
  "qr",
  "connected",
  "disconnected",
  "logged_out",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

// What the HTTP API and the Vercel backend get to see. Never includes
// credentials or session files.
export type ConnectionSnapshot = {
  connectionId: string;
  businessId: string;
  status: ConnectionStatus;
  qr: string | null;
  qrExpiresAt: string | null;
  connectedAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

export type InboundMessage = {
  connectionId: string;
  messageId: string;
  sender: string;
  recipient: string;
  text: string;
  messageType: "text";
  timestamp: number;
  direction: "inbound";
};

export type StatusEvent = {
  connectionId: string;
  businessId: string;
  status: ConnectionStatus;
  phoneNumber: string | null;
  lastError: string | null;
};

export type SendResult = {
  messageId: string;
};

export interface ConnectionManagerApi {
  start(connectionId: string, businessId: string): Promise<ConnectionSnapshot>;
  get(connectionId: string): ConnectionSnapshot | null;
  disconnect(
    connectionId: string,
    businessId: string,
    options?: { logout?: boolean }
  ): Promise<ConnectionSnapshot>;
  send(
    connectionId: string,
    businessId: string,
    recipient: string,
    message: string
  ): Promise<SendResult>;
  stats(): { total: number; connected: number };
  shutdown(): Promise<void>;
}

// Minimal view of a Baileys socket. Only the members this service touches.
export type WASocketLike = {
  ev: {
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
  sendMessage(
    jid: string,
    content: { text: string }
  ): Promise<{ key?: { id?: string | null } | null } | undefined>;
  logout?: () => Promise<void>;
  end?: (error?: Error) => void;
  user?: { id?: string | null } | null;
};

// Raw shape of a Baileys message, kept loose on purpose.
export type RawWaMessage = {
  key?: {
    id?: string | null;
    remoteJid?: string | null;
    fromMe?: boolean | null;
  } | null;
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
    [key: string]: unknown;
  } | null;
  messageTimestamp?: number | string | { toNumber(): number } | null;
  pushName?: string | null;
};

export type RawConnectionUpdate = {
  qr?: string | null;
  connection?: "connecting" | "open" | "close" | null;
  lastDisconnect?: { error?: unknown } | null;
};

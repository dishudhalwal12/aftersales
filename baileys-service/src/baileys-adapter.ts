// Thin adapter around the Baileys library. Everything Baileys-specific lives
// here so the connection manager can be unit-tested with fake sockets.

import { rm } from "node:fs/promises";
import path from "node:path";

import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";

import type { WASocketLike } from "./types";

export type AuthState = Awaited<ReturnType<typeof useMultiFileAuthState>>;

export type SocketFactory = (params: {
  connectionId: string;
  auth: AuthState;
}) => WASocketLike;

export type AuthStateLoader = (connectionId: string) => Promise<AuthState>;
export type SessionRemover = (connectionId: string) => Promise<void>;
export type QrEncoder = (qr: string) => Promise<string>;

// Baileys expects a pino-style logger. We silence it so our own logger is the
// only output (it also stops the library from printing QR/credential details).
const quietLogger = {
  level: "silent",
  child() {
    return quietLogger;
  },
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

export function createSocketFactory(): SocketFactory {
  return ({ auth }) => {
    const socket = makeWASocket({
      auth: auth.state,
      // The QR is rendered by us and sent to the backend, never to a terminal.
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: quietLogger as never,
    });

    return socket as unknown as WASocketLike;
  };
}

// One credential folder per connection. Baileys reads and updates these files
// itself, so two connections can never share a session.
export function createAuthStateLoader(storagePath: string): AuthStateLoader {
  return (connectionId) => useMultiFileAuthState(path.join(storagePath, connectionId));
}

export function createSessionRemover(storagePath: string): SessionRemover {
  return async (connectionId) => {
    await rm(path.join(storagePath, connectionId), { recursive: true, force: true });
  };
}

export function encodeQr(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });
}

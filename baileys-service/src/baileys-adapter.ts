// Thin adapter around the Baileys library. Everything Baileys-specific lives
// here so the connection manager can be unit-tested with fake sockets.

import { rm } from "node:fs/promises";
import path from "node:path";

import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";

import type { Logger } from "./config";
import { createBaileysLogger } from "./config";
import type { WASocketLike } from "./types";

export type AuthState = Awaited<ReturnType<typeof useMultiFileAuthState>>;

export type SocketFactory = (params: {
  connectionId: string;
  auth: AuthState;
}) => WASocketLike;

export type AuthStateLoader = (connectionId: string) => Promise<AuthState>;
export type SessionRemover = (connectionId: string) => Promise<void>;
export type QrEncoder = (qr: string) => Promise<string>;

// Baileys expects a pino-style logger. Info/debug stay silent (they carry QR and
// credential material); warn/error are forwarded, because Bad MAC and stream
// errors are the only evidence that a "connected" socket stopped delivering.
export function createSocketFactory(logger: Logger): SocketFactory {
  const libraryLogger = createBaileysLogger(logger);
  return ({ auth }) => {
    const socket = makeWASocket({
      auth: auth.state,
      // The QR is rendered by us and sent to the backend, never to a terminal.
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: libraryLogger as never,
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

// Entry point: load configuration, wire hooks to the Vercel backend, and start
// the local HTTP API.

import "dotenv/config";

import {
  createAuthStateLoader,
  createSessionRemover,
  createSocketFactory,
  encodeQr,
} from "./baileys-adapter";
import { createApp } from "./app";
import { createLogger, loadConfig } from "./config";
import { ConnectionManager } from "./connection-manager";
import type { InboundMessage, StatusEvent } from "./types";
import { createJsonPoster } from "./webhook-client";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const inboundPoster = createJsonPoster<InboundMessage>({
    url: config.webhookUrl,
    secret: config.secret,
    timeoutMs: config.webhookTimeoutMs,
    logger,
    retries: 3,
  });

  const statusPoster = createJsonPoster<StatusEvent>({
    url: config.statusWebhookUrl,
    secret: config.secret,
    timeoutMs: config.webhookTimeoutMs,
    logger,
    retries: 2,
  });

  const manager = new ConnectionManager({
    loadAuthState: createAuthStateLoader(config.sessionStoragePath),
    createSocket: createSocketFactory(),
    removeSession: createSessionRemover(config.sessionStoragePath),
    encodeQr,
    logger,
    connectWaitMs: config.connectWaitMs,
    reconnectMaxDelayMs: config.reconnectMaxDelayMs,
    hooks: {
      onInbound: (message) => inboundPoster.deliver(message),
      onStatus: (event) => statusPoster.deliver(event),
    },
  });

  const app = createApp({ manager, secret: config.secret, logger });
  const server = app.listen(config.port, () => {
    logger.info(`listening on http://localhost:${config.port}`);
    logger.info("forwarding incoming messages to the Vercel backend", {
      webhookUrl: config.webhookUrl,
      statusWebhookUrl: config.statusWebhookUrl,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}; closing WhatsApp sockets`);
    server.close();
    await manager.shutdown();
    // Give pending webhook requests a moment before exiting.
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", reason);
  });
}

main().catch((error: unknown) => {
  console.error("[baileys:error] failed to start:", error);
  process.exit(1);
});

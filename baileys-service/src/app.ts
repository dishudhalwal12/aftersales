// HTTP API for the Vercel backend. Everything except /health requires the
// shared secret header; the app is built with an injected connection manager
// so tests can run without a real WhatsApp account.

import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import type { Logger } from "./config";
import { HttpError } from "./errors";
import { rateLimit, requestLogger, requireSecret } from "./security";
import type { ConnectionManagerApi } from "./types";

export type AppOptions = {
  manager: ConnectionManagerApi;
  secret: string;
  logger: Logger;
  /** Requests per minute for write endpoints (default 60). */
  rateLimitMax?: number;
};

const connectSchema = z
  .object({
    connectionId: z.string().trim().min(8).max(80),
    businessId: z.string().trim().min(1).max(80),
  })
  .strict();

const sendSchema = z
  .object({
    connectionId: z.string().trim().min(8).max(80),
    businessId: z.string().trim().min(1).max(80),
    recipient: z.string().trim().min(5).max(200),
    message: z.string().min(1).max(4096),
  })
  .strict();

const disconnectSchema = z
  .object({
    businessId: z.string().trim().min(1).max(80),
    logout: z.boolean().optional(),
  })
  .strict();

type AsyncHandler = (
  request: Request,
  response: Response,
  next: NextFunction
) => Promise<unknown>;

function handle(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

function validationDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function createApp(options: AppOptions): express.Express {
  const { manager, secret, logger } = options;
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger(logger));
  app.use(express.json({ limit: "1mb" }));

  // Public, minimal and safe: no secrets, session paths or tokens.
  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "aftersales-baileys",
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      connections: manager.stats(),
    });
  });

  app.use(requireSecret(secret));

  const writeLimiter = rateLimit({ max: options.rateLimitMax ?? 60 });

  app.post(
    "/connect",
    writeLimiter,
    handle(async (request, response) => {
      const body = connectSchema.parse(request.body ?? {});
      const snapshot = await manager.start(body.connectionId, body.businessId);
      response.status(200).json(snapshot);
    })
  );

  app.get(
    "/qr/:connectionId",
    handle(async (request, response) => {
      const snapshot = manager.get(request.params.connectionId);
      if (!snapshot) {
        response.status(404).json({
          error: {
            code: "CONNECTION_NOT_FOUND",
            message: "That WhatsApp connection does not exist.",
          },
        });
        return;
      }
      response.json({
        connectionId: snapshot.connectionId,
        status: snapshot.status,
        qr: snapshot.qr,
        qrExpiresAt: snapshot.qrExpiresAt,
        connectedAt: snapshot.connectedAt,
      });
    })
  );

  app.get(
    "/status/:connectionId",
    handle(async (request, response) => {
      const snapshot = manager.get(request.params.connectionId);
      if (!snapshot) {
        response.status(404).json({
          error: {
            code: "CONNECTION_NOT_FOUND",
            message: "That WhatsApp connection does not exist.",
          },
        });
        return;
      }
      response.json({
        connectionId: snapshot.connectionId,
        businessId: snapshot.businessId,
        status: snapshot.status,
        qrAvailable: Boolean(snapshot.qr),
        connectedAt: snapshot.connectedAt,
        phoneNumber: snapshot.phoneNumber,
        lastError: snapshot.lastError,
      });
    })
  );

  app.post(
    "/disconnect/:connectionId",
    writeLimiter,
    handle(async (request, response) => {
      const body = disconnectSchema.parse(request.body ?? {});
      const snapshot = await manager.disconnect(
        request.params.connectionId,
        body.businessId,
        { logout: body.logout ?? true }
      );
      response.json(snapshot);
    })
  );

  app.post(
    "/send",
    writeLimiter,
    handle(async (request, response) => {
      const body = sendSchema.parse(request.body ?? {});
      const result = await manager.send(
        body.connectionId,
        body.businessId,
        body.recipient,
        body.message
      );
      response.json(result);
    })
  );

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown endpoint." },
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request payload failed validation.",
          details: validationDetails(error),
        },
      });
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }

    if (
      error instanceof SyntaxError &&
      typeof (error as { status?: unknown }).status === "number"
    ) {
      response.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      });
      return;
    }

    logger.error("unhandled request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });
  });

  return app;
}

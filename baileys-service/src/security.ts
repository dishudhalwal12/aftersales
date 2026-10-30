import { createHash, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import type { Logger } from "./config";

export const SECRET_HEADER = "x-baileys-secret";

// Constant-time comparison over fixed-length digests, so neither length nor
// content timing leaks the expected secret.
export function secretsMatch(expected: string, provided: string): boolean {
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  const providedHash = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedHash, providedHash);
}

// Applied to every route except /health. The service only talks to the Vercel
// backend, which sends the shared secret in the x-baileys-secret header.
export function requireSecret(secret: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    const provided = request.header(SECRET_HEADER);
    if (!provided || !secretsMatch(secret, provided)) {
      response.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid service secret." },
      });
      return;
    }
    next();
  };
}

type Bucket = { count: number; resetAt: number };

// Simple in-memory limiter for the few write endpoints. Good enough for a
// single-process hackathon service; no external store needed.
export function rateLimit(options: {
  windowMs?: number;
  max?: number;
} = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;
  const buckets = new Map<string, Bucket>();

  return (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= max) {
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
        },
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

// Logs only method/path/status; never headers, bodies or secrets.
export function requestLogger(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      logger.debug(`${request.method} ${request.path} ${response.statusCode}`, {
        ms: Date.now() - startedAt,
      });
    });
    next();
  };
}

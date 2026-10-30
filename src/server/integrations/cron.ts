// Cron authentication for background integration work (email polling). Vercel
// Cron sends `Authorization: Bearer <CRON_SECRET>`; local schedulers may send
// `x-cron-secret`. An unset secret disables the route rather than exposing it.

import { createHash, timingSafeEqual } from "node:crypto";

import { IntegrationError } from "./errors.ts";

export function assertCronSecret(request: Request): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new IntegrationError(
      503,
      "CRON_NOT_CONFIGURED",
      "CRON_SECRET is not set, so scheduled integration jobs are disabled."
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const provided = bearer || request.headers.get("x-cron-secret")?.trim() || "";

  if (!provided) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Scheduled job authentication failed.");
  }

  const expected = createHash("sha256").update(secret, "utf8").digest();
  const actual = createHash("sha256").update(provided, "utf8").digest();
  if (!timingSafeEqual(expected, actual)) {
    throw new IntegrationError(401, "UNAUTHORIZED", "Scheduled job authentication failed.");
  }
}

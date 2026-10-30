// Integration failures reuse the app's HttpError envelope (status + message)
// and add a stable machine reason that summaries and status payloads expose
// instead of leaking provider responses.

import { HttpError } from "../auth/http-error.ts";

export class IntegrationError extends HttpError {
  readonly reason: string;

  constructor(status: number, reason: string, message: string) {
    super(status, message);
    this.name = "IntegrationError";
    this.reason = reason;
  }
}

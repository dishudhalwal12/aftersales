// HTTP errors shared by the connection manager and the Express app. The
// response envelope matches the Vercel backend: { error: { code, message } }.

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "That WhatsApp connection does not exist.") {
    super(404, "CONNECTION_NOT_FOUND", message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "That connection belongs to a different business.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotConnectedError extends HttpError {
  constructor(message = "The WhatsApp connection is not currently connected.") {
    super(409, "CONNECTION_NOT_CONNECTED", message);
  }
}

export class UpstreamError extends HttpError {
  constructor(message = "WhatsApp delivery failed.") {
    super(502, "WHATSAPP_SEND_FAILED", message);
  }
}

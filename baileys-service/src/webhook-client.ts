// POSTs JSON to the Vercel backend with a bounded retry strategy. A failed
// webhook is logged and retried a few times, never silently dropped.

import type { Logger } from "./config";
import { SECRET_HEADER } from "./security";

export type JsonPosterOptions = {
  url: string;
  secret: string;
  timeoutMs: number;
  logger: Logger;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type JsonPoster<T> = {
  deliver(payload: T): Promise<boolean>;
};

const RETRY_BASE_DELAY_MS = 500;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function createJsonPoster<T>(options: JsonPosterOptions): JsonPoster<T> {
  const retries = Math.max(1, options.retries ?? 3);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async deliver(payload: T): Promise<boolean> {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);

        try {
          const response = await fetchImpl(options.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [SECRET_HEADER]: options.secret,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          if (response.ok) {
            // Drain the body so the connection can be reused.
            await response.text().catch(() => "");
            return true;
          }

          const detail = await response.text().catch(() => "");
          options.logger.warn("webhook rejected", {
            status: response.status,
            attempt,
            detail: detail.slice(0, 300),
          });
        } catch (error) {
          options.logger.warn("webhook attempt failed", {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          clearTimeout(timer);
        }

        if (attempt < retries) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
        }
      }

      options.logger.error("webhook delivery failed after retries", {
        url: options.url,
        attempts: retries,
      });
      return false;
    },
  };
}

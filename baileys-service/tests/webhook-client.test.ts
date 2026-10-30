import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../src/config";
import type { InboundMessage } from "../src/types";
import { createJsonPoster } from "../src/webhook-client";

const payload: InboundMessage = {
  connectionId: "wa_connection_01",
  messageId: "WAMID_1",
  sender: "919700000001@s.whatsapp.net",
  recipient: "919812345678",
  text: "Hello",
  messageType: "text",
  timestamp: 1_730_000_000_000,
  direction: "inbound",
};

function poster(fetchImpl: typeof fetch) {
  return createJsonPoster<InboundMessage>({
    url: "https://example.test/api/channels/whatsapp/inbound",
    secret: "shared-secret",
    timeoutMs: 1000,
    logger: silentLogger,
    retries: 3,
    fetchImpl,
    sleep: async () => {},
  });
}

describe("webhook client", () => {
  it("POSTs the payload with the shared-secret header", async () => {
    let captured: RequestInit | undefined;
    const fetchMock = (async (_input: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await expect(poster(fetchMock).deliver(payload)).resolves.toBe(true);

    expect(captured?.method).toBe("POST");
    expect((captured?.headers as Record<string, string>)["x-baileys-secret"]).toBe(
      "shared-secret"
    );
    expect(JSON.parse(String(captured?.body))).toEqual(payload);
  });

  it("retries transient failures and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(poster(fetchMock as unknown as typeof fetch).deliver(payload)).resolves.toBe(
      true
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget instead of throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("network down"));

    await expect(poster(fetchMock as unknown as typeof fetch).deliver(payload)).resolves.toBe(
      false
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// Inbound channel webhook handling: verified tenant mapping, idempotency on
// externalMessageId, and the shared triage pipeline. The provider is the only
// thing a webhook may choose — the business is resolved from the session or a
// channel-bound secret, never from provider-supplied content.

import { createHash, timingSafeEqual } from "node:crypto";

import type { Business } from "@prisma/client";

import { ApiError } from "./api";
import { assertChannelAvailable } from "./channels";
import { prisma } from "./db";
import {
  getTriageResultForTicket,
  triageInboundMessage,
  type TriageDependencies,
  type TriageResult,
} from "./triage";

export const WEBHOOK_PROVIDERS = ["WHATSAPP", "INSTAGRAM", "GMAIL"] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export type InboundWebhookInput = {
  business: Business;
  provider: WebhookProvider;
  externalMessageId: string;
  customerName: string;
  customerHandle: string;
  message: string;
};

export type InboundWebhookOutcome = {
  duplicate: boolean;
  result: TriageResult;
};

export function parseWebhookProvider(raw: string): WebhookProvider | null {
  const normalized = raw.trim().toUpperCase();
  return (WEBHOOK_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as WebhookProvider)
    : null;
}

// Only a SHA-256 hash of the provider secret is stored on the channel row, so
// configJson never holds the credential a caller must present.
export function readWebhookSecretHash(configJson: string | null): string | null {
  if (!configJson) return null;
  try {
    const parsed: unknown = JSON.parse(configJson);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "webhookSecretHash" in parsed &&
      typeof (parsed as { webhookSecretHash?: unknown }).webhookSecretHash === "string"
    ) {
      const hash = (parsed as { webhookSecretHash: string }).webhookSecretHash.trim();
      return /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function webhookSecretMatches(
  configJson: string | null,
  provided: string | null | undefined
): boolean {
  const expectedHex = readWebhookSecretHash(configJson);
  if (!expectedHex || !provided) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = createHash("sha256").update(provided, "utf8").digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function handleInboundWebhook(
  input: InboundWebhookInput,
  deps: TriageDependencies = {}
): Promise<InboundWebhookOutcome> {
  await assertChannelAvailable(input.business.id, input.provider);
  // Pre-check keeps duplicate deliveries from spending an LLM call. The unique
  // constraint below still covers the concurrent-delivery race.
  const existing = await prisma.ticket.findUnique({
    where: { externalMessageId: input.externalMessageId },
  });

  if (existing) {
    if (existing.businessId !== input.business.id) {
      throw new ApiError(
        409,
        "MESSAGE_ID_CONFLICT",
        "That externalMessageId is already in use."
      );
    }
    return { duplicate: true, result: await getTriageResultForTicket(existing.id) };
  }

  try {
    const result = await triageInboundMessage(
      {
        business: input.business,
        query: input.message,
        channel: input.provider,
        customerName: input.customerName,
        customerHandle: input.customerHandle,
        externalMessageId: input.externalMessageId,
      },
      deps
    );
    return { duplicate: false, result };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const winner = await prisma.ticket.findUnique({
        where: { externalMessageId: input.externalMessageId },
      });
      if (winner && winner.businessId === input.business.id) {
        return { duplicate: true, result: await getTriageResultForTicket(winner.id) };
      }
      throw new ApiError(
        409,
        "MESSAGE_ID_CONFLICT",
        "That externalMessageId is already in use."
      );
    }
    throw error;
  }
}

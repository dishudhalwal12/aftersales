/**
 * Inbound-channel wiring: the provider → ticket-channel map and the shared-secret check
 * that lets an external provider deliver without the owner's browser session.
 *
 * Pure on purpose: no Prisma, no Next, so both the route and the Phase 3 gate can unit-test it.
 */

import { timingSafeEqual } from "node:crypto";
import type { TicketChannel } from "../../shared/domain.ts";

const CHANNEL_FOR_PROVIDER: Readonly<Record<string, TicketChannel>> = {
  whatsapp: "WHATSAPP",
  instagram: "INSTAGRAM",
  gmail: "GMAIL",
};

/** `null` for a provider this deployment does not accept (the route answers 404). */
export function channelForProvider(provider: string): TicketChannel | null {
  return CHANNEL_FOR_PROVIDER[provider.trim().toLowerCase()] ?? null;
}

/**
 * A provider token is only ever accepted when the deployment configured one. An empty
 * expected value disables the path entirely, so the route falls back to the owner session.
 */
export function isWebhookTokenValid(expected: string, provided: string): boolean {
  const left = Buffer.from(expected.trim(), "utf8");
  const right = Buffer.from(provided.trim(), "utf8");
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

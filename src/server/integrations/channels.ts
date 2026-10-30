// Channel-row helpers shared by the provider integrations. Connection state
// lives in ChannelConnection (status, autoSend, configJson) — the same table the
// rest of the app reads, so no second source of truth is introduced.

import type { ChannelConnection } from "@prisma/client";
import { prisma } from "../db.ts";
import { IntegrationError } from "./errors.ts";

export const CHANNEL_STATUSES = ["CONNECTED", "TEST_MODE", "DRAFT_ONLY", "UNAVAILABLE"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

// A channel row must exist and must not be UNAVAILABLE before it may receive
// or originate traffic. DRAFT_ONLY/TEST_MODE remain usable.
export async function assertChannelAvailable(
  businessId: string,
  channelType: string,
): Promise<ChannelConnection> {
  const connection = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId, channelType } },
  });

  if (!connection || connection.status === "UNAVAILABLE") {
    throw new IntegrationError(
      409,
      "CHANNEL_UNAVAILABLE",
      `The ${channelType} channel is not available for this business.`,
    );
  }

  return connection;
}

export function readChannelConfig(configJson: string | null): Record<string, unknown> {
  if (!configJson) return {};
  try {
    const parsed: unknown = JSON.parse(configJson);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  } catch {
    return {};
  }
}

export function isChannelStatus(value: unknown): value is ChannelStatus {
  return typeof value === "string" && (CHANNEL_STATUSES as readonly string[]).includes(value);
}

// Businesses created before a channel type existed (or seeded rows) may not
// have a row yet. Connecting a provider creates it with the same defaults the
// onboarding flow uses, so no migration is needed when a new type is added.
export async function ensureChannelConnection(
  businessId: string,
  channelType: string,
): Promise<ChannelConnection> {
  return prisma.channelConnection.upsert({
    where: { businessId_channelType: { businessId, channelType } },
    update: {},
    create: { businessId, channelType, status: "UNAVAILABLE", autoSend: false },
  });
}

export type ChannelConfigUpdate = {
  config?: Record<string, unknown>;
  status?: ChannelStatus;
  autoSend?: boolean;
};

export async function updateChannelConfig(
  channel: ChannelConnection,
  update: ChannelConfigUpdate,
): Promise<ChannelConnection> {
  const nextConfig = { ...readChannelConfig(channel.configJson), ...(update.config ?? {}) };
  return prisma.channelConnection.update({
    where: { id: channel.id },
    data: {
      configJson: JSON.stringify(nextConfig),
      ...(update.status ? { status: update.status } : {}),
      ...(update.autoSend === undefined ? {} : { autoSend: update.autoSend }),
    },
  });
}

// Best-effort error marker for status endpoints. The channel keeps its current
// status so a transient provider failure does not silently delete the
// connection, but the owner can see why the channel is not working.
export async function recordIntegrationError(
  businessId: string,
  channelType: string,
  errorKey: string,
  message: string,
): Promise<void> {
  const channel = await ensureChannelConnection(businessId, channelType);
  await updateChannelConfig(channel, { config: { [errorKey]: message.slice(0, 500) } });
}

export async function clearIntegrationError(
  channel: ChannelConnection,
  errorKey: string,
): Promise<ChannelConnection> {
  return updateChannelConfig(channel, { config: { [errorKey]: null } });
}

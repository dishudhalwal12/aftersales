import type { ChannelConnection } from "@prisma/client";

import { ApiError } from "./api";
import type { ChannelType } from "./constants";
import { prisma } from "./db";

// A channel row must exist and must not be UNAVAILABLE before it may receive
// or originate traffic. DRAFT_ONLY/TEST_MODE remain usable.
export async function assertChannelAvailable(
  businessId: string,
  channelType: ChannelType
): Promise<ChannelConnection> {
  const connection = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId, channelType } },
  });

  if (!connection || connection.status === "UNAVAILABLE") {
    throw new ApiError(
      409,
      "CHANNEL_UNAVAILABLE",
      `The ${channelType} channel is not available for this business.`
    );
  }

  return connection;
}

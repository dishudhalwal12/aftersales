// Session-guarded lookup for the dashboard routes. Kept apart from
// lib/whatsapp.ts so the channel/service layer stays free of NextAuth imports
// and can be exercised directly in tests.

import type { Business, ChannelConnection } from "@prisma/client";

import { assertBusinessOwnership } from "./auth";
import { assertChannelAvailable } from "./channels";

export async function resolveOwnedWhatsappChannel(
  userId: string,
  businessId: string
): Promise<{ business: Business; channel: ChannelConnection }> {
  const business = await assertBusinessOwnership(userId, businessId);
  const channel = await assertChannelAvailable(business.id, "WHATSAPP");
  return { business, channel };
}

// Session-guarded lookup for the dashboard routes. Kept apart from whatsapp.ts
// so the channel/service layer stays free of request-context imports and can be
// exercised directly in tests.

import type { Business, ChannelConnection } from "@prisma/client";
import { loadOwnedBusiness } from "../auth/tenant.ts";
import { assertChannelAvailable } from "./channels.ts";

export async function resolveOwnedWhatsappChannel(
  userId: string,
  businessId: string,
): Promise<{ business: Business; channel: ChannelConnection }> {
  const business = await loadOwnedBusiness(userId, businessId);
  const channel = await assertChannelAvailable(business.id, "WHATSAPP");
  return { business, channel };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../server/db.ts";
import { getCurrentUser } from "../../server/auth/session.ts";

/**
 * "Reset demo state" — removes only tickets the demo created (no external id).
 * Seeded tickets are left untouched so the insights keep their history.
 */
export async function resetDemoAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const owned = await prisma.business.findMany({
    where: { ownerId: user.id },
    select: { id: true },
  });
  const ids = owned.map((business) => business.id);

  if (ids.length > 0) {
    await prisma.ticket.deleteMany({
      where: { businessId: { in: ids }, externalMessageId: null },
    });
    await prisma.voiceTestSession.deleteMany({ where: { businessId: { in: ids } } });
  }

  revalidatePath("/dashboard");
}

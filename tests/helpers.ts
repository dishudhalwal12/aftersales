import type { Business } from "@prisma/client";

import { prisma } from "@/lib/db";

export const RAG_A = "test_rag_biz_a";
export const RAG_B = "test_rag_biz_b";
export const TRIAGE_BIZ = "test_triage_biz";
export const TRIAGE_OTHER_BIZ = "test_triage_other_biz";

export async function resetBusinessData(businessIds: string[]): Promise<void> {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: businessIds } } },
  });
  await prisma.ticket.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.knowledgeChunk.deleteMany({
    where: { businessId: { in: businessIds } },
  });
  await prisma.channelConnection.deleteMany({
    where: { businessId: { in: businessIds } },
  });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
}

export async function createTestBusiness(params: {
  id: string;
  ownerEmail: string;
  name: string;
}): Promise<Business> {
  const owner = await prisma.user.upsert({
    where: { email: params.ownerEmail },
    update: {},
    create: { email: params.ownerEmail, name: "Test Owner" },
  });

  return prisma.business.create({
    data: {
      id: params.id,
      ownerId: owner.id,
      name: params.name,
      businessType: "SaaS",
      description: "Test business description.",
      productsServices: "Test product catalogue.",
      hours: "Monday to Friday, 9:00 AM to 5:00 PM IST.",
      returnPolicy: "Test refund policy.",
      faqs: "Q: Test? A: Yes.",
      escalationEmail: "test@example.com",
      escalationPhone: "+919000000000",
      compiledBrainMd: "# Test Business Brain",
    },
  });
}

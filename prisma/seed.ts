/**
 * Seed: two demo businesses owned by the judge account, one foreign tenant to
 * prove isolation, and a ticket history rich enough to make the queue and the
 * weekly insights panel real on first paint.
 *
 * Run with `npm run db:seed`. Safe to re-run: it rebuilds derived rows.
 */

import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chunkMarkdown, compileBrainMd } from "../src/server/ai/rag.ts";
import {
  BUSINESS_A,
  BUSINESS_A_TICKETS,
  BUSINESS_B,
  BUSINESS_B_TICKETS,
  BUSINESS_C,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  RIVAL_EMAIL,
  type SeedBusiness,
  type SeedTicket,
} from "../src/data/seed-facts.ts";
import { hashPassword } from "../src/server/auth/crypto.ts";

if (!process.env.DATABASE_URL) {
  const dbPath = fileURLToPath(new URL("./dev.db", import.meta.url));
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;

const CHANNELS: Record<string, Array<{ type: string; status: string; autoSend: boolean }>> = {
  [BUSINESS_A.id]: [
    { type: "WHATSAPP", status: "CONNECTED", autoSend: true },
    { type: "FACEBOOK", status: "UNAVAILABLE", autoSend: false },
    { type: "INSTAGRAM", status: "TEST_MODE", autoSend: true },
    // Gmail starts in test mode: "connected" is only claimed after a real
    // OAuth round stores credentials (see /api/social/email/status).
    { type: "GMAIL", status: "TEST_MODE", autoSend: true },
    { type: "SARVAM_VOICE", status: "TEST_MODE", autoSend: true },
  ],
  [BUSINESS_B.id]: [
    { type: "WHATSAPP", status: "CONNECTED", autoSend: true },
    { type: "FACEBOOK", status: "UNAVAILABLE", autoSend: false },
    { type: "INSTAGRAM", status: "DRAFT_ONLY", autoSend: false },
    { type: "GMAIL", status: "TEST_MODE", autoSend: true },
    { type: "SARVAM_VOICE", status: "TEST_MODE", autoSend: true },
  ],
  [BUSINESS_C.id]: [{ type: "GMAIL", status: "DRAFT_ONLY", autoSend: false }],
};

function eventsFor(ticket: SeedTicket, createdAt: Date, citedIds: string[]): Array<{
  eventType: string;
  payload: string;
  createdAt: Date;
}> {
  const stage = (offsetMinutes: number) => new Date(createdAt.getTime() + offsetMinutes * 60 * 1000);
  const events = [
    {
      eventType: "INBOUND_RECEIVED",
      payload: JSON.stringify({ channel: ticket.channel, externalMessageId: ticket.externalId }),
      createdAt: stage(0),
    },
    {
      eventType: "RAG_RETRIEVED",
      payload: JSON.stringify({ chunkIds: citedIds, topK: 4 }),
      createdAt: stage(1),
    },
    {
      eventType: "ROUTING_DECIDED",
      payload: JSON.stringify({
        rule: ticket.rule,
        confidence: ticket.confidence,
        urgency: ticket.urgency,
        sentiment: ticket.sentiment,
      }),
      createdAt: stage(1),
    },
  ];

  const outcome =
    ticket.action === "answered"
      ? "AUTO_SENT"
      : ticket.action === "draft"
        ? "DRAFT_SAVED"
        : "ESCALATED";

  events.push({
    eventType: outcome,
    payload: JSON.stringify({
      actionStatus: ticket.action,
      specialist: ticket.specialist,
      citedChunkIds: citedIds,
    }),
    createdAt: stage(2),
  });

  return events;
}

async function seedBusiness(
  business: SeedBusiness,
  ownerId: string,
  tickets: SeedTicket[],
): Promise<void> {
  const compiledBrainMd = compileBrainMd(business.facts);
  const drafts = chunkMarkdown(compiledBrainMd);

  await prisma.business.upsert({
    where: { id: business.id },
    create: {
      id: business.id,
      ownerId,
      name: business.facts.name,
      businessType: business.facts.businessType,
      description: business.facts.description,
      productsServices: business.facts.productsServices,
      hours: business.facts.hours,
      returnPolicy: business.facts.returnPolicy,
      faqs: business.facts.faqs,
      escalationEmail: business.facts.escalationEmail,
      escalationPhone: business.facts.escalationPhone,
      agentTone: business.facts.agentTone,
      autoSendEnabled: true,
      compiledBrainMd,
      brainVersion: 1,
      rawMarkdownUpload: business.facts.rawMarkdownUpload,
    },
    update: {
      ownerId,
      name: business.facts.name,
      businessType: business.facts.businessType,
      description: business.facts.description,
      productsServices: business.facts.productsServices,
      hours: business.facts.hours,
      returnPolicy: business.facts.returnPolicy,
      faqs: business.facts.faqs,
      escalationEmail: business.facts.escalationEmail,
      escalationPhone: business.facts.escalationPhone,
      agentTone: business.facts.agentTone,
      compiledBrainMd,
      brainVersion: 1,
      rawMarkdownUpload: business.facts.rawMarkdownUpload,
    },
  });

  await prisma.knowledgeChunk.deleteMany({ where: { businessId: business.id } });
  const chunkIds: string[] = [];
  for (const [index, draft] of drafts.entries()) {
    const id = `chk_${business.chunkPrefix}_${String(index + 1).padStart(2, "0")}`;
    chunkIds.push(id);
    await prisma.knowledgeChunk.create({
      data: {
        id,
        businessId: business.id,
        chunkIndex: index,
        section: draft.section,
        content: draft.content,
        keywords: draft.keywords,
      },
    });
  }

  await prisma.channelConnection.deleteMany({ where: { businessId: business.id } });
  for (const channel of CHANNELS[business.id] ?? []) {
    await prisma.channelConnection.create({
      data: {
        businessId: business.id,
        channelType: channel.type,
        status: channel.status,
        autoSend: channel.autoSend,
        configJson: JSON.stringify({ mode: channel.status.toLowerCase() }),
      },
    });
  }

  await prisma.ticket.deleteMany({ where: { businessId: business.id } });
  const now = Date.now();

  for (const ticket of tickets) {
    const createdAt = new Date(now - ticket.ageHours * HOUR_MS);
    const citedIds = ticket.cited
      .map((oneBased) => chunkIds[oneBased - 1])
      .filter((id): id is string => typeof id === "string");

    const row = await prisma.ticket.create({
      data: {
        businessId: business.id,
        externalMessageId: ticket.externalId,
        channel: ticket.channel,
        customerName: ticket.customerName,
        customerHandle: ticket.customerHandle,
        customerQuery: ticket.query,
        state: ticket.state,
        specialistAssigned: ticket.specialist,
        intent: ticket.intent,
        sentiment: ticket.sentiment,
        urgencyScore: ticket.urgency,
        confidenceScore: ticket.confidence,
        actionStatus: ticket.action,
        routingRuleHit: ticket.rule,
        aiDraftOrReply: ticket.reply,
        citedChunkIds: JSON.stringify(citedIds),
        createdAt,
        updatedAt: createdAt,
      },
    });

    for (const event of eventsFor(ticket, createdAt, citedIds)) {
      await prisma.ticketEvent.create({
        data: {
          ticketId: row.id,
          eventType: event.eventType,
          payload: event.payload,
          createdAt: event.createdAt,
        },
      });
    }
  }

  console.log(
    `  ${business.facts.name}: ${drafts.length} chunks, ${tickets.length} tickets, ${(CHANNELS[business.id] ?? []).length} channels`,
  );
}

async function main(): Promise<void> {
  console.log("Seeding AfterSales AI…");

  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Judge Demo", passwordHash: hashPassword(DEMO_PASSWORD) },
    update: { name: "Judge Demo" },
  });

  const rival = await prisma.user.upsert({
    where: { email: RIVAL_EMAIL },
    create: { email: RIVAL_EMAIL, name: "Nimbus Owner", passwordHash: hashPassword("nimbus-demo-41") },
    update: {},
  });

  await seedBusiness(BUSINESS_A, demo.id, BUSINESS_A_TICKETS);
  await seedBusiness(BUSINESS_B, demo.id, BUSINESS_B_TICKETS);
  await seedBusiness(BUSINESS_C, rival.id, []);

  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

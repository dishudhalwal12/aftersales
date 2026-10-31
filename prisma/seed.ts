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

/**
 * Call-script fields that are not part of the retrieval brain. Mappings are
 * intentionally left empty: the demo rents one shared number and one agent, so
 * binding either one to both businesses would be an ambiguous mapping — the
 * session/PIN fallback is the honest path until each business has its own.
 * Re-running the seed never overwrites a mapping the owner saved.
 */
const VOICE_CONTEXT: Record<
  string,
  {
    businessAddress: string;
    weeklyHolidays: string[];
    supportedLanguages: string[];
    appointmentPolicy: string;
    agentInstructions: string;
  }
> = {
  [BUSINESS_A.id]: {
    businessAddress: "3rd Floor, Orbit Plaza, MG Road, Bengaluru 560001",
    weeklyHolidays: ["Sunday"],
    supportedLanguages: ["Hindi", "English"],
    appointmentPolicy:
      "Demo calls are scheduled by the owner. Support hours are Monday to Saturday, 9:00 AM to 7:00 PM IST.",
    agentInstructions:
      "Quote only the plans in the brain. Never promise a refund after the 7-day window; offer the escalation email instead.",
  },
  [BUSINESS_B.id]: {
    businessAddress: "12 Vidhyadhar Nagar, Jaipur 302039",
    weeklyHolidays: ["Monday"],
    supportedLanguages: ["Hindi", "English"],
    appointmentPolicy:
      "Appointments can be rescheduled free of charge up to 4 hours before the slot; later cancellations carry a ₹300 fee.",
    agentInstructions:
      "Never give a diagnosis or dosage. For pain, swelling or bleeding, offer a same-day slot or the front desk phone.",
  },
};

/** Next occurrence of a weekday (0 = Sunday), always in the future. */
function upcomingDate(weekday: number): string {
  const now = new Date();
  const delta = (weekday - now.getUTCDay() + 7) % 7 || 7;
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta),
  );
  return next.toISOString().slice(0, 10);
}

/**
 * Demo schedules for the two seeded businesses. The clinic deliberately shows
 * both override kinds: a closed Wednesday and a special Saturday evening.
 * Re-running the seed restores these values.
 */
function buildCustomizationSeed(): Record<
  string,
  Array<{ type: string; isEnabled: boolean; configuration: Record<string, unknown> }>
> {
  const weekday = (closed: boolean, windows: Array<{ start: string; end: string }>) => ({
    closed,
    windows,
    note: "",
  });
  const morning = [{ start: "10:00", end: "14:00" }];

  return {
    [BUSINESS_A.id]: [
      {
        type: "availability",
        isEnabled: true,
        configuration: {
          timezone: "Asia/Kolkata",
          slotMinutes: 30,
          bufferMinutes: 10,
          maxPerSlot: 1,
          minAdvanceHours: 4,
          maxFutureDays: 30,
          weekly: [
            { day: "Monday", closed: false, windows: [{ start: "09:00", end: "18:00" }] },
            { day: "Tuesday", closed: false, windows: [{ start: "09:00", end: "18:00" }] },
            { day: "Wednesday", closed: false, windows: [{ start: "09:00", end: "18:00" }] },
            { day: "Thursday", closed: false, windows: [{ start: "09:00", end: "18:00" }] },
            { day: "Friday", closed: false, windows: [{ start: "09:00", end: "18:00" }] },
            { day: "Saturday", closed: true, windows: [] },
            { day: "Sunday", closed: true, windows: [] },
          ],
          dateOverrides: [],
          temporaryClosures: [],
        },
      },
      {
        type: "appointment_booking",
        isEnabled: true,
        configuration: {
          bookingRules:
            "Demo and onboarding calls are 30 minutes. The owner confirms every slot after the call.",
          noSlotBehavior: "Offer a callback request instead of promising a slot.",
          requiredDetails: ["name", "phone", "preferred_date", "preferred_time"],
        },
      },
      {
        type: "cancellation_policy",
        isEnabled: true,
        configuration: {
          policyText: "Demo calls can be cancelled free of charge up to 4 hours before the slot.",
          cutoffHours: 4,
          feeNote: "",
        },
      },
      {
        type: "rescheduling_policy",
        isEnabled: true,
        configuration: {
          policyText: "Rescheduling is free up to 4 hours before the slot.",
          cutoffHours: 4,
          feeNote: "",
        },
      },
      {
        type: "callback_requests",
        isEnabled: true,
        configuration: {
          instructions: "Ask what the call is about and take the best number to reach them.",
          collectPhone: true,
          responseWindow: "the same working day",
        },
      },
      {
        type: "urgent_call_handling",
        isEnabled: true,
        configuration: {
          instructions: "If the caller is blocked on a live issue, take the details and flag it.",
          emergencyInstructions:
            "If anyone is in immediate danger, tell the caller to contact local emergency services now.",
          transferNumber: null,
          transferEnabled: false,
        },
      },
      {
        type: "business_specific_instructions",
        isEnabled: true,
        configuration: {
          instructions:
            "Quote only the plans in the brain. Never promise a refund outside the 7-day window.",
        },
      },
    ],
    [BUSINESS_B.id]: [
      {
        type: "availability",
        isEnabled: true,
        configuration: {
          timezone: "Asia/Kolkata",
          slotMinutes: 20,
          bufferMinutes: 5,
          maxPerSlot: 1,
          minAdvanceHours: 2,
          maxFutureDays: 45,
          weekly: [
            { day: "Monday", closed: true, windows: [] },
            { day: "Tuesday", closed: false, windows: morning },
            { day: "Wednesday", closed: false, windows: morning },
            { day: "Thursday", closed: false, windows: morning },
            { day: "Friday", closed: false, windows: morning },
            { day: "Saturday", closed: false, windows: morning },
            { day: "Sunday", closed: false, windows: morning },
          ],
          dateOverrides: [
            { date: upcomingDate(3), ...weekday(true, []), note: "Doctor at a conference" },
            { date: upcomingDate(6), ...weekday(false, [{ start: "16:00", end: "19:00" }]), note: "Special evening clinic" },
          ],
          temporaryClosures: [],
        },
      },
      {
        type: "appointment_booking",
        isEnabled: true,
        configuration: {
          bookingRules:
            "New patients are seen in the morning. The clinic confirms every appointment after the call.",
          noSlotBehavior: "Offer the next available day or a callback request; never promise a slot.",
          requiredDetails: ["name", "phone", "preferred_date", "preferred_time"],
        },
      },
      {
        type: "cancellation_policy",
        isEnabled: true,
        configuration: {
          policyText:
            "Appointments can be cancelled free of charge up to 4 hours before the slot.",
          cutoffHours: 4,
          feeNote: "Later cancellations carry a ₹300 fee.",
        },
      },
      {
        type: "rescheduling_policy",
        isEnabled: true,
        configuration: {
          policyText:
            "Appointments can be rescheduled free of charge up to 4 hours before the slot.",
          cutoffHours: 4,
          feeNote: "Later changes carry a ₹300 fee.",
        },
      },
      {
        type: "callback_requests",
        isEnabled: true,
        configuration: {
          instructions:
            "If no appointment works, take the patient's name and number for the front desk.",
          collectPhone: true,
          responseWindow: "the same working day",
        },
      },
      {
        type: "urgent_call_handling",
        isEnabled: true,
        configuration: {
          instructions:
            "For severe pain or swelling, offer the earliest slot or a front-desk callback.",
          emergencyInstructions:
            "If the caller describes a medical emergency, tell them to contact local emergency services immediately. Do not try to book a routine appointment first.",
          transferNumber: null,
          transferEnabled: false,
        },
      },
      {
        type: "business_specific_instructions",
        isEnabled: true,
        configuration: {
          instructions:
            "Never give a diagnosis or dosage. Always make clear that the clinic confirms the appointment later.",
        },
      },
    ],
  };
}

const CUSTOMIZATION_SEED = buildCustomizationSeed();

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

  const voiceContext = VOICE_CONTEXT[business.id];
  if (voiceContext !== undefined) {
    await prisma.businessVoiceAgentContext.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        businessAddress: voiceContext.businessAddress,
        weeklyHolidays: JSON.stringify(voiceContext.weeklyHolidays),
        supportedLanguages: JSON.stringify(voiceContext.supportedLanguages),
        appointmentPolicy: voiceContext.appointmentPolicy,
        agentInstructions: voiceContext.agentInstructions,
      },
      // Mapping fields stay as the owner saved them.
      update: {
        businessAddress: voiceContext.businessAddress,
        weeklyHolidays: JSON.stringify(voiceContext.weeklyHolidays),
        supportedLanguages: JSON.stringify(voiceContext.supportedLanguages),
        appointmentPolicy: voiceContext.appointmentPolicy,
        agentInstructions: voiceContext.agentInstructions,
      },
    });
  }

  for (const customization of CUSTOMIZATION_SEED[business.id] ?? []) {
    const configuration = JSON.stringify(customization.configuration);
    await prisma.businessVoiceAgentCustomization.upsert({
      where: {
        businessId_customizationType: {
          businessId: business.id,
          customizationType: customization.type,
        },
      },
      create: {
        businessId: business.id,
        customizationType: customization.type,
        configuration,
        isEnabled: customization.isEnabled,
      },
      update: { configuration, isEnabled: customization.isEnabled },
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

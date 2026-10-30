import type { Business } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { LLMError, type generateTriageResponse } from "@/lib/llm-orchestrator";
import type { LLMResponse } from "@/lib/routing-engine";
import { triageInboundMessage, type TriageInput } from "@/lib/triage";

import {
  createTestBusiness,
  resetBusinessData,
  TRIAGE_BIZ,
  TRIAGE_OTHER_BIZ,
} from "./helpers";

const OWNER_EMAIL = "triage-owner@sphinx.demo";

let business: Business;

type LLMFn = typeof generateTriageResponse;

function baseLlm(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 92,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: ["chk_triage_01"],
    reply_text: "The Pro Plan costs ₹1,499 per month for up to five users.",
    ...overrides,
  };
}

function fakeLlm(result: LLMResponse | Error): LLMFn {
  return async () => {
    if (result instanceof Error) throw result;
    return result;
  };
}

function input(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    business,
    query: "What is the Pro Plan price?",
    channel: "TEXT_MODAL",
    customerName: "Judge Tester",
    customerHandle: "judge@sphinx.demo",
    ...overrides,
  };
}

beforeAll(async () => {
  await resetBusinessData([TRIAGE_BIZ, TRIAGE_OTHER_BIZ]);
  business = await createTestBusiness({
    id: TRIAGE_BIZ,
    ownerEmail: OWNER_EMAIL,
    name: "Triage Test SaaS",
  });
  await createTestBusiness({
    id: TRIAGE_OTHER_BIZ,
    ownerEmail: OWNER_EMAIL,
    name: "Triage Test Clinic",
  });

  await prisma.knowledgeChunk.createMany({
    data: [
      {
        id: "chk_triage_01",
        businessId: TRIAGE_BIZ,
        chunkIndex: 1,
        section: "Products & Pricing",
        content:
          "The Pro Plan costs ₹1,499 per month for up to five users and includes WhatsApp invoicing.",
        keywords: "pro,plan,pricing,invoicing",
      },
      {
        id: "chk_triage_other_01",
        businessId: TRIAGE_OTHER_BIZ,
        chunkIndex: 1,
        section: "Products & Pricing",
        content: "Root Canal Treatment costs ₹4,500 per tooth.",
        keywords: "root,canal,treatment",
      },
    ],
  });

  await prisma.channelConnection.create({
    data: {
      businessId: TRIAGE_BIZ,
      channelType: "GMAIL",
      status: "DRAFT_ONLY",
      autoSend: false,
    },
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [TRIAGE_BIZ, TRIAGE_OTHER_BIZ] } } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: { in: [TRIAGE_BIZ, TRIAGE_OTHER_BIZ] } },
  });
});

afterAll(async () => {
  await resetBusinessData([TRIAGE_BIZ, TRIAGE_OTHER_BIZ]);
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
});

describe("triageInboundMessage", () => {
  it("auto-sends a grounded answer and persists ticket, citations, and events", async () => {
    const result = await triageInboundMessage(input(), { llm: fakeLlm(baseLlm()) });

    expect(result.actionStatus).toBe("answered");
    expect(result.routingRuleHit).toBe("R6");
    expect(result.shouldAutoSend).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].chunkId).toBe("chk_triage_01");
    expect(result.sources[0].excerpt.length).toBeGreaterThan(0);

    const ticket = await prisma.ticket.findUnique({
      where: { id: result.ticketId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });

    expect(ticket).not.toBeNull();
    expect(ticket?.businessId).toBe(TRIAGE_BIZ);
    expect(ticket?.state).toBe("replied");
    expect(ticket?.actionStatus).toBe("answered");
    expect(JSON.parse(ticket?.citedChunkIds ?? "[]")).toEqual(["chk_triage_01"]);
    expect(ticket?.events.map((event) => event.eventType)).toEqual([
      "INBOUND_RECEIVED",
      "RAG_RETRIEVED",
      "ROUTING_DECIDED",
      "AUTO_SENT",
    ]);
  });

  it("never auto-sends at confidence 49 and escalates instead", async () => {
    const result = await triageInboundMessage(input(), {
      llm: fakeLlm(baseLlm({ confidence_score: 49 })),
    });

    expect(result.routingRuleHit).toBe("R2");
    expect(result.actionStatus).toBe("escalated");
    expect(result.shouldAutoSend).toBe(false);
    expect(result.confidenceScore).toBe(49);

    const ticket = await prisma.ticket.findUnique({ where: { id: result.ticketId } });
    expect(ticket?.state).toBe("escalated");
    expect(ticket?.actionStatus).toBe("escalated");
  });

  it("rejects citations from another tenant and escalates", async () => {
    const result = await triageInboundMessage(input(), {
      llm: fakeLlm(
        baseLlm({ cited_chunk_ids: ["chk_triage_other_01"], confidence_score: 99 })
      ),
    });

    expect(result.routingRuleHit).toBe("R2");
    expect(result.actionStatus).toBe("escalated");
    expect(result.shouldAutoSend).toBe(false);
    expect(result.sources).toEqual([]);

    const ticket = await prisma.ticket.findUnique({ where: { id: result.ticketId } });
    expect(JSON.parse(ticket?.citedChunkIds ?? "[]")).toEqual([]);
  });

  it("fails safe with R7 when the LLM call errors", async () => {
    const result = await triageInboundMessage(input(), {
      llm: fakeLlm(new LLMError("REQUEST_FAILED", "provider unavailable")),
    });

    expect(result.routingRuleHit).toBe("R7");
    expect(result.actionStatus).toBe("failed");
    expect(result.shouldAutoSend).toBe(false);
    expect(result.answer).toContain("can't reliably answer");
    expect(result.sources).toEqual([]);

    const ticket = await prisma.ticket.findUnique({
      where: { id: result.ticketId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    expect(ticket?.actionStatus).toBe("failed");
    expect(ticket?.events.at(-1)?.eventType).toBe("ESCALATED");
  });

  it("drafts but does not send on a DRAFT_ONLY channel (R5)", async () => {
    const result = await triageInboundMessage(input({ channel: "GMAIL" }), {
      llm: fakeLlm(baseLlm()),
    });

    expect(result.routingRuleHit).toBe("R5");
    expect(result.actionStatus).toBe("draft");
    expect(result.shouldAutoSend).toBe(false);

    const ticket = await prisma.ticket.findUnique({ where: { id: result.ticketId } });
    expect(ticket?.state).toBe("triaged");
  });

  it("escalates explicit human requests even when the answer is grounded (R1)", async () => {
    const result = await triageInboundMessage(input(), {
      llm: fakeLlm(baseLlm({ explicit_human_request: true })),
    });

    expect(result.routingRuleHit).toBe("R1");
    expect(result.actionStatus).toBe("escalated");
    expect(result.shouldAutoSend).toBe(false);
  });
});

import { createHash } from "node:crypto";

import type { Business } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  handleInboundWebhook,
  parseWebhookProvider,
  webhookSecretMatches,
  type InboundWebhookInput,
} from "@/lib/channel-webhook";
import { prisma } from "@/lib/db";
import { LLMError, type generateTriageResponse } from "@/lib/llm-orchestrator";
import type { LLMResponse } from "@/lib/routing-engine";

import { createTestBusiness, resetBusinessData } from "./helpers";

const WEBHOOK_BIZ = "test_webhook_biz";
const WEBHOOK_OTHER_BIZ = "test_webhook_other_biz";
const OWNER_EMAIL = "webhook-owner@sphinx.demo";
const WEBHOOK_SECRET = "whsec_test_123";
const WEBHOOK_SECRET_HASH = createHash("sha256").update(WEBHOOK_SECRET).digest("hex");

let business: Business;
let otherBusiness: Business;

function baseLlm(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency_score: 20,
    confidence_score: 92,
    explicit_human_request: false,
    requires_human_judgment: false,
    cited_chunk_ids: ["chk_webhook_01"],
    reply_text: "The Pro Plan costs ₹1,499 per month for up to five users.",
    ...overrides,
  };
}

function countingLlm(result: LLMResponse | Error) {
  const state = { calls: 0 };
  const llm: typeof generateTriageResponse = async () => {
    state.calls += 1;
    if (result instanceof Error) throw result;
    return result;
  };
  return { llm, state };
}

function webhookInput(overrides: Partial<InboundWebhookInput> = {}): InboundWebhookInput {
  return {
    business,
    provider: "WHATSAPP",
    externalMessageId: "wa_msg_001",
    customerName: "Rohit Sharma",
    customerHandle: "+919812345678",
    message: "What is the Pro Plan price?",
    ...overrides,
  };
}

beforeAll(async () => {
  await resetBusinessData([WEBHOOK_BIZ, WEBHOOK_OTHER_BIZ]);
  business = await createTestBusiness({
    id: WEBHOOK_BIZ,
    ownerEmail: OWNER_EMAIL,
    name: "Webhook Test SaaS",
  });
  otherBusiness = await createTestBusiness({
    id: WEBHOOK_OTHER_BIZ,
    ownerEmail: OWNER_EMAIL,
    name: "Webhook Test Clinic",
  });

  await prisma.knowledgeChunk.createMany({
    data: [
      {
        id: "chk_webhook_01",
        businessId: WEBHOOK_BIZ,
        chunkIndex: 1,
        section: "Products & Pricing",
        content:
          "The Pro Plan costs ₹1,499 per month for up to five users and includes WhatsApp invoicing.",
        keywords: "pro,plan,pricing,invoicing",
      },
      {
        id: "chk_webhook_other_01",
        businessId: WEBHOOK_OTHER_BIZ,
        chunkIndex: 1,
        section: "Products & Pricing",
        content: "Root Canal Treatment costs ₹4,500 per tooth.",
        keywords: "root,canal,treatment",
      },
    ],
  });

  await prisma.channelConnection.createMany({
    data: [
      {
        businessId: WEBHOOK_BIZ,
        channelType: "WHATSAPP",
        status: "TEST_MODE",
        autoSend: true,
        configJson: JSON.stringify({ webhookSecretHash: WEBHOOK_SECRET_HASH }),
      },
      { businessId: WEBHOOK_BIZ, channelType: "GMAIL", status: "DRAFT_ONLY", autoSend: false },
      { businessId: WEBHOOK_BIZ, channelType: "INSTAGRAM", status: "UNAVAILABLE", autoSend: false },
      {
        businessId: WEBHOOK_OTHER_BIZ,
        channelType: "WHATSAPP",
        status: "TEST_MODE",
        autoSend: true,
      },
    ],
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [WEBHOOK_BIZ, WEBHOOK_OTHER_BIZ] } } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: { in: [WEBHOOK_BIZ, WEBHOOK_OTHER_BIZ] } },
  });
});

afterAll(async () => {
  await resetBusinessData([WEBHOOK_BIZ, WEBHOOK_OTHER_BIZ]);
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
});

describe("handleInboundWebhook", () => {
  it("triages a new webhook into exactly one ticket", async () => {
    const { llm, state } = countingLlm(baseLlm());

    const outcome = await handleInboundWebhook(
      webhookInput({ externalMessageId: "wa_msg_new_1" }),
      { llm }
    );

    expect(outcome.duplicate).toBe(false);
    expect(outcome.result.actionStatus).toBe("answered");
    expect(outcome.result.routingRuleHit).toBe("R6");
    expect(outcome.result.shouldAutoSend).toBe(true);
    expect(outcome.result.sources[0]?.chunkId).toBe("chk_webhook_01");
    expect(state.calls).toBe(1);

    const tickets = await prisma.ticket.findMany({ where: { businessId: WEBHOOK_BIZ } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].channel).toBe("WHATSAPP");
    expect(tickets[0].externalMessageId).toBe("wa_msg_new_1");
  });

  it("deduplicates a repeated externalMessageId without a second LLM call", async () => {
    const { llm, state } = countingLlm(baseLlm());

    const first = await handleInboundWebhook(
      webhookInput({ externalMessageId: "wa_msg_dup_1" }),
      { llm }
    );
    const second = await handleInboundWebhook(
      webhookInput({ externalMessageId: "wa_msg_dup_1" }),
      { llm }
    );

    expect(second.duplicate).toBe(true);
    expect(second.result.ticketId).toBe(first.result.ticketId);
    expect(second.result.answer).toBe(first.result.answer);
    expect(second.result.sources).toEqual(first.result.sources);
    expect(state.calls).toBe(1);

    expect(await prisma.ticket.count({ where: { businessId: WEBHOOK_BIZ } })).toBe(1);
  });

  it("drafts but never sends on a DRAFT_ONLY channel (R5)", async () => {
    const { llm } = countingLlm(baseLlm());

    const outcome = await handleInboundWebhook(
      webhookInput({ provider: "GMAIL", externalMessageId: "gmail_msg_1" }),
      { llm }
    );

    expect(outcome.result.routingRuleHit).toBe("R5");
    expect(outcome.result.actionStatus).toBe("draft");
    expect(outcome.result.shouldAutoSend).toBe(false);

    const ticket = await prisma.ticket.findUnique({
      where: { externalMessageId: "gmail_msg_1" },
    });
    expect(ticket?.state).toBe("triaged");
    expect(ticket?.actionStatus).toBe("draft");
  });

  it("rejects an UNAVAILABLE channel without touching the queue", async () => {
    const { llm, state } = countingLlm(baseLlm());

    await expect(
      handleInboundWebhook(
        webhookInput({ provider: "INSTAGRAM", externalMessageId: "ig_msg_1" }),
        { llm }
      )
    ).rejects.toMatchObject({ status: 409, code: "CHANNEL_UNAVAILABLE" });

    expect(state.calls).toBe(0);
    expect(await prisma.ticket.count({ where: { businessId: WEBHOOK_BIZ } })).toBe(0);
  });

  it("refuses an externalMessageId already used by another business", async () => {
    const { llm } = countingLlm(baseLlm());

    await handleInboundWebhook(webhookInput({ externalMessageId: "shared_msg_1" }), {
      llm,
    });

    await expect(
      handleInboundWebhook(
        webhookInput({
          business: otherBusiness,
          externalMessageId: "shared_msg_1",
        }),
        { llm }
      )
    ).rejects.toMatchObject({ status: 409, code: "MESSAGE_ID_CONFLICT" });

    expect(await prisma.ticket.count({ where: { businessId: WEBHOOK_BIZ } })).toBe(1);
    expect(await prisma.ticket.count({ where: { businessId: WEBHOOK_OTHER_BIZ } })).toBe(0);
  });

  it("stores a failed ticket on LLM failure and replays it on redelivery (R7)", async () => {
    const { llm, state } = countingLlm(
      new LLMError("REQUEST_FAILED", "provider unavailable")
    );

    const first = await handleInboundWebhook(
      webhookInput({ externalMessageId: "wa_msg_r7" }),
      { llm }
    );
    expect(first.result.routingRuleHit).toBe("R7");
    expect(first.result.actionStatus).toBe("failed");
    expect(first.result.shouldAutoSend).toBe(false);

    const second = await handleInboundWebhook(
      webhookInput({ externalMessageId: "wa_msg_r7" }),
      { llm }
    );
    expect(second.duplicate).toBe(true);
    expect(second.result.actionStatus).toBe("failed");
    expect(second.result.shouldAutoSend).toBe(false);
    expect(state.calls).toBe(1);
  });
});

describe("webhook security helpers", () => {
  it("matches only the exact channel-bound secret against its stored hash", () => {
    const config = JSON.stringify({ webhookSecretHash: WEBHOOK_SECRET_HASH });

    expect(webhookSecretMatches(config, WEBHOOK_SECRET)).toBe(true);
    expect(webhookSecretMatches(config, "whsec_other")).toBe(false);
    expect(webhookSecretMatches(config, null)).toBe(false);
    expect(webhookSecretMatches(config, "")).toBe(false);
    expect(webhookSecretMatches(null, WEBHOOK_SECRET)).toBe(false);
    expect(webhookSecretMatches("{not-json", WEBHOOK_SECRET)).toBe(false);
    expect(
      webhookSecretMatches(JSON.stringify({ webhookSecret: WEBHOOK_SECRET }), WEBHOOK_SECRET)
    ).toBe(false);
    expect(
      webhookSecretMatches(JSON.stringify({ webhookSecretHash: "not-a-hash" }), WEBHOOK_SECRET)
    ).toBe(false);
  });

  it("parses known providers case-insensitively and rejects the rest", () => {
    expect(parseWebhookProvider("whatsapp")).toBe("WHATSAPP");
    expect(parseWebhookProvider(" Gmail ")).toBe("GMAIL");
    expect(parseWebhookProvider("instagram")).toBe("INSTAGRAM");
    expect(parseWebhookProvider("sarvam_voice")).toBeNull();
    expect(parseWebhookProvider("")).toBeNull();
  });
});

import type { Business, VoiceTestSession } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  SarvamError,
  answerVoiceQuery,
  assertToolSecret,
  assertWebhookSecret,
  buildVoiceVariables,
  createVoiceSession,
  handleVoiceCompletion,
  isSarvamConfigured,
  resolveVoiceSession,
  scoreToConfidence,
  startOutboundCall,
  VOICE_SESSION_TTL_MS,
} from "@/lib/sarvam";

import { createTestBusiness, resetBusinessData } from "./helpers";

const VOICE_BIZ_A = "test_voice_biz_a";
const VOICE_BIZ_B = "test_voice_biz_b";
const OWNER_EMAIL = "voice-owner@sphinx.demo";
const PHONE_A = "+919800000011";
const SECRET_KEYS = [
  "SARVAM_API_KEY",
  "SARVAM_AGENT_ID",
  "SARVAM_VIRTUAL_NUMBER",
  "SARVAM_API_BASE_URL",
  "SARVAM_OUTBOUND_PATH",
  "SARVAM_TOOL_SECRET",
  "SARVAM_WEBHOOK_SECRET",
] as const;
const ORIGINAL_ENV = { ...process.env };

let businessA: Business;
let businessB: Business;

function createSession(overrides: {
  id: string;
  businessId?: string;
  phone?: string;
  pin?: string;
  status?: string;
  expiresAt?: Date;
}): Promise<VoiceTestSession> {
  return prisma.voiceTestSession.create({
    data: {
      id: overrides.id,
      businessId: overrides.businessId ?? VOICE_BIZ_A,
      judgePhone: overrides.phone ?? PHONE_A,
      demoPin: overrides.pin ?? "4821",
      status: overrides.status ?? "in_progress",
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
    },
  });
}

function captureApiError(fn: () => void): ApiError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected an ApiError to be thrown.");
}

beforeAll(async () => {
  await resetBusinessData([VOICE_BIZ_A, VOICE_BIZ_B]);
  businessA = await createTestBusiness({
    id: VOICE_BIZ_A,
    ownerEmail: OWNER_EMAIL,
    name: "Voice Test SaaS",
  });
  businessB = await createTestBusiness({
    id: VOICE_BIZ_B,
    ownerEmail: OWNER_EMAIL,
    name: "Voice Test Clinic",
  });

  await prisma.knowledgeChunk.createMany({
    data: [
      {
        id: "chk_voice_01",
        businessId: VOICE_BIZ_A,
        chunkIndex: 1,
        section: "Products & Pricing",
        content:
          "The Pro Plan costs ₹1,499 per month for up to five users and includes WhatsApp invoicing.",
        keywords: "pro,plan,pricing,costs,month,users",
      },
      {
        id: "chk_voice_02",
        businessId: VOICE_BIZ_A,
        chunkIndex: 2,
        section: "Support Hours",
        content: "Support is open Monday to Saturday from 9:00 AM to 7:00 PM IST.",
        keywords: "hours,support,monday,saturday",
      },
      {
        id: "chk_voice_other_01",
        businessId: VOICE_BIZ_B,
        chunkIndex: 1,
        section: "Products & Pricing",
        content: "Root Canal Treatment costs ₹4,500 per tooth.",
        keywords: "root,canal,treatment,costs",
      },
    ],
  });
});

beforeEach(async () => {
  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: { in: [VOICE_BIZ_A, VOICE_BIZ_B] } } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: { in: [VOICE_BIZ_A, VOICE_BIZ_B] } },
  });
  await prisma.voiceTestSession.deleteMany({
    where: { businessId: { in: [VOICE_BIZ_A, VOICE_BIZ_B] } },
  });
});

afterEach(() => {
  for (const key of SECRET_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

afterAll(async () => {
  await resetBusinessData([VOICE_BIZ_A, VOICE_BIZ_B]);
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
});

describe("voice session resolution", () => {
  it("resolves an active session by session id and joins the business", async () => {
    await createSession({ id: "vsess_by_id" });

    const session = await resolveVoiceSession({ sessionId: "vsess_by_id" });
    expect(session?.business.id).toBe(VOICE_BIZ_A);
    expect(session?.demoPin).toBe("4821");
  });

  it("resolves by demoPin and by caller phone", async () => {
    await createSession({ id: "vsess_pin", pin: "7315" });

    expect((await resolveVoiceSession({ demoPin: "7315" }))?.id).toBe("vsess_pin");
    expect((await resolveVoiceSession({ callerPhone: PHONE_A }))?.id).toBe("vsess_pin");
  });

  it("ignores expired, completed, and failed sessions", async () => {
    await createSession({ id: "vsess_expired", expiresAt: new Date(Date.now() - 1000) });
    await createSession({ id: "vsess_completed", status: "completed" });
    await createSession({ id: "vsess_failed", status: "failed" });

    expect(await resolveVoiceSession({ sessionId: "vsess_expired" })).toBeNull();
    expect(await resolveVoiceSession({ sessionId: "vsess_completed" })).toBeNull();
    expect(await resolveVoiceSession({ sessionId: "vsess_failed" })).toBeNull();
  });

  it("prefers an explicit session id over a conflicting demoPin", async () => {
    await createSession({ id: "vsess_priority", pin: "1111" });
    await createSession({
      id: "vsess_other",
      businessId: VOICE_BIZ_B,
      pin: "2222",
      phone: "+919800000022",
    });

    const session = await resolveVoiceSession({
      sessionId: "vsess_priority",
      demoPin: "2222",
    });
    expect(session?.id).toBe("vsess_priority");
    expect(session?.business.id).toBe(VOICE_BIZ_A);
  });

  it("creates a session with a 4-digit PIN and a 10-minute expiry", async () => {
    const before = Date.now();
    const session = await createVoiceSession(VOICE_BIZ_A, PHONE_A);

    expect(session.demoPin).toMatch(/^\d{4}$/);
    expect(session.status).toBe("initiated");
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + VOICE_SESSION_TTL_MS - 1000
    );
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + VOICE_SESSION_TTL_MS + 1000
    );
  });
});

describe("voice grounding", () => {
  it("answers from the selected business's chunks with a citation", async () => {
    const grounding = await answerVoiceQuery(
      businessA,
      "What is the Pro Plan pricing?"
    );

    expect(grounding.escalateToHuman).toBe(false);
    expect(grounding.confidenceScore).toBeGreaterThanOrEqual(50);
    expect(grounding.citedChunkIds).toEqual(["chk_voice_01"]);
    expect(grounding.groundedFacts).toContain("₹1,499");
  });

  it("escalates the same question under the other business without leaking facts", async () => {
    const grounding = await answerVoiceQuery(
      businessB,
      "What is the Pro Plan pricing?"
    );

    expect(grounding.escalateToHuman).toBe(true);
    expect(grounding.citedChunkIds).toEqual([]);
    expect(grounding.confidenceScore).toBeLessThan(50);
    expect(grounding.groundedFacts).not.toContain("₹4,500");
    expect(grounding.groundedFacts).not.toContain("₹1,499");
  });

  it("answers a multi-fact question by citing every contributing chunk", async () => {
    const grounding = await answerVoiceQuery(
      businessA,
      "What are your prices and hours?"
    );

    expect(grounding.escalateToHuman).toBe(false);
    expect(grounding.confidenceScore).toBeGreaterThanOrEqual(50);
    expect(grounding.citedChunkIds.sort()).toEqual(["chk_voice_01", "chk_voice_02"]);
    expect(grounding.groundedFacts).toContain("₹1,499");
    expect(grounding.groundedFacts).toContain("9:00");
  });

  it("escalates when section headings match but the chunk content does not", async () => {
    const grounding = await answerVoiceQuery(businessB, "Do you offer the Pro Plan?");

    expect(grounding.escalateToHuman).toBe(true);
    expect(grounding.citedChunkIds).toEqual([]);
  });

  it("maps retrieval scores to a confidence curve with a 50-point boundary", () => {
    expect(scoreToConfidence(0)).toBe(0);
    expect(scoreToConfidence(1)).toBeLessThan(50);
    expect(scoreToConfidence(2)).toBeGreaterThanOrEqual(50);
    expect(scoreToConfidence(5)).toBeGreaterThan(90);
    expect(scoreToConfidence(50)).toBeLessThanOrEqual(99);
  });

  it("sends only identity variables per call, never business facts", async () => {
    const session = await createSession({ id: "vsess_vars" });
    const variables = buildVoiceVariables(businessA, session);

    expect(variables).toEqual({
      business_name: "Voice Test SaaS",
      business_type: "SaaS",
      demo_pin: "4821",
      session_id: "vsess_vars",
    });
    expect(JSON.stringify(variables)).not.toContain("₹");
    expect(JSON.stringify(variables)).not.toContain(businessA.productsServices);
  });
});

describe("Sarvam outbound client", () => {
  it("is not configured without an API key and agent id", async () => {
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_AGENT_ID;

    const session = await createSession({ id: "vsess_noconfig" });
    expect(isSarvamConfigured()).toBe(false);
    await expect(startOutboundCall(session, businessA)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("posts per-call variables to the configured endpoint", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_AGENT_ID = "agent_123";
    process.env.SARVAM_VIRTUAL_NUMBER = "+919000000000";
    process.env.SARVAM_API_BASE_URL = "https://sarvam.test/";
    process.env.SARVAM_OUTBOUND_PATH = "/v1/calls";

    const session = await createSession({ id: "vsess_call" });
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ id: "call_abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await startOutboundCall(session, businessA, { fetch: fetchMock });

    expect(result.interactionId).toBe("call_abc");
    expect(capturedUrl).toBe("https://sarvam.test/v1/calls");
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>)["api-subscription-key"]).toBe(
      "test-key"
    );

    const payload = JSON.parse(String(capturedInit?.body));
    expect(payload.agent_id).toBe("agent_123");
    expect(payload.to).toBe(PHONE_A);
    expect(payload.from).toBe("+919000000000");
    expect(payload.variables.business_name).toBe("Voice Test SaaS");
    expect(payload.variables.demo_pin).toBe("4821");
    expect(JSON.stringify(payload)).not.toContain("₹1,499");
  });

  it("surfaces provider HTTP failures as REQUEST_FAILED", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_AGENT_ID = "agent_123";

    const session = await createSession({ id: "vsess_fail" });
    const fetchMock = (async () =>
      new Response("{}", { status: 500 })) as typeof fetch;

    await expect(
      startOutboundCall(session, businessA, { fetch: fetchMock })
    ).rejects.toBeInstanceOf(SarvamError);
  });
});

describe("voice completion webhook", () => {
  it("saves the transcript and opens an R1 escalation ticket for human requests", async () => {
    await createSession({ id: "vsess_done_1" });

    const outcome = await handleVoiceCompletion({
      sessionId: "vsess_done_1",
      status: "completed",
      sarvamInteractionId: "call_777",
      transcript: "Let me talk to a real human manager.",
      durationSeconds: 87,
      callerRequestedHuman: true,
    });

    expect(outcome.session.status).toBe("completed");
    expect(outcome.session.transcript).toContain("human manager");
    expect(outcome.session.durationSeconds).toBe(87);
    expect(outcome.session.sarvamInteractionId).toBe("call_777");
    expect(outcome.escalationOutcome).toBe("escalated_to_owner");
    expect(outcome.duplicateTicket).toBe(false);

    const ticket = await prisma.ticket.findUnique({
      where: { externalMessageId: "voice_vsess_done_1" },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    expect(ticket).not.toBeNull();
    expect(ticket?.businessId).toBe(VOICE_BIZ_A);
    expect(ticket?.channel).toBe("VOICE");
    expect(ticket?.state).toBe("escalated");
    expect(ticket?.actionStatus).toBe("escalated");
    expect(ticket?.routingRuleHit).toBe("R1");
    expect(ticket?.customerHandle).toBe(PHONE_A);
    expect(ticket?.events.map((event) => event.eventType)).toEqual([
      "INBOUND_RECEIVED",
      "ROUTING_DECIDED",
      "ESCALATED",
    ]);
  });

  it("does not open a second ticket when the callback is replayed", async () => {
    await createSession({ id: "vsess_replay" });

    const first = await handleVoiceCompletion({
      sessionId: "vsess_replay",
      transcript: "I still need help with my refund.",
      resolved: false,
    });
    const second = await handleVoiceCompletion({
      sessionId: "vsess_replay",
      transcript: "I still need help with my refund.",
      resolved: false,
    });

    expect(first.duplicateTicket).toBe(false);
    expect(second.duplicateTicket).toBe(true);
    expect(second.ticketId).toBe(first.ticketId);
    expect(
      await prisma.ticket.count({ where: { businessId: VOICE_BIZ_A } })
    ).toBe(1);

    const ticket = await prisma.ticket.findUnique({ where: { id: first.ticketId! } });
    expect(ticket?.routingRuleHit).toBe("R2");
  });

  it("marks resolved calls without creating a ticket", async () => {
    await createSession({ id: "vsess_resolved" });

    const outcome = await handleVoiceCompletion({
      sessionId: "vsess_resolved",
      resolved: true,
      transcript: "The agent answered my pricing question.",
    });

    expect(outcome.escalationOutcome).toBe("resolved_by_ai");
    expect(outcome.ticketId).toBeNull();
    expect(await prisma.ticket.count({ where: { businessId: VOICE_BIZ_A } })).toBe(0);
  });

  it("records failed calls without creating a ticket", async () => {
    await createSession({ id: "vsess_call_failed" });

    const outcome = await handleVoiceCompletion({
      sessionId: "vsess_call_failed",
      status: "failed",
    });

    expect(outcome.session.status).toBe("failed");
    expect(outcome.escalationOutcome).toBeNull();
    expect(outcome.ticketId).toBeNull();
    expect(await prisma.ticket.count({ where: { businessId: VOICE_BIZ_A } })).toBe(0);
  });

  it("rejects unknown sessions", async () => {
    await expect(
      handleVoiceCompletion({ sessionId: "vsess_missing" })
    ).rejects.toMatchObject({ status: 404, code: "VOICE_SESSION_NOT_FOUND" });
  });
});

describe("voice endpoint secrets", () => {
  it("requires a configured tool secret and a matching header", () => {
    delete process.env.SARVAM_TOOL_SECRET;
    expect(captureApiError(() => assertToolSecret("anything")).code).toBe(
      "SARVAM_NOT_CONFIGURED"
    );

    process.env.SARVAM_TOOL_SECRET = "tool-secret";
    expect(() => assertToolSecret("tool-secret")).not.toThrow();
    const mismatch = captureApiError(() => assertToolSecret("wrong"));
    expect(mismatch.status).toBe(401);
    expect(mismatch.code).toBe("UNAUTHORIZED");
  });

  it("requires a configured webhook secret and a matching header", () => {
    delete process.env.SARVAM_WEBHOOK_SECRET;
    expect(captureApiError(() => assertWebhookSecret(null)).status).toBe(503);

    process.env.SARVAM_WEBHOOK_SECRET = "hook-secret";
    expect(() => assertWebhookSecret("hook-secret")).not.toThrow();
    expect(captureApiError(() => assertWebhookSecret("wrong")).status).toBe(401);
  });
});

import type { Business, ChannelConnection } from "@prisma/client";

import type { RespondResult } from "../src/server/business/service.ts";

export function business(overrides: Partial<Business> = {}): Business {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "business_1",
    ownerId: "user_1",
    name: "CloudPulse CRM",
    businessType: "SaaS",
    description: "Inventory and GST billing software for retail shops.",
    productsServices: "Starter Plan: INR 499 per month. Pro Plan: INR 1499 per month.",
    hours: "Monday to Saturday, 9:00 AM to 7:00 PM IST.",
    returnPolicy: "Full refund within 7 days if fewer than 10 invoices were generated.",
    faqs: "Q: How do I export GSTR-1? A: Reports > GST > Export JSON.",
    escalationEmail: "founder@cloudpulse.example",
    escalationPhone: "+919876543210",
    agentTone: "Warm, concise, and helpful",
    autoSendEnabled: true,
    compiledBrainMd: "# Business brain",
    brainVersion: 1,
    rawMarkdownUpload: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function channel(
  config: Record<string, unknown> | null,
  overrides: Partial<ChannelConnection> = {},
): ChannelConnection {
  return {
    id: "channel_1",
    businessId: "business_1",
    channelType: "GMAIL",
    status: "CONNECTED",
    autoSend: true,
    configJson: config === null ? null : JSON.stringify(config),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function respondResult(overrides: Partial<RespondResult> = {}): RespondResult {
  return {
    ticketId: "ticket_1",
    businessId: "business_1",
    specialist: "sales",
    intent: "refund_policy",
    sentiment: "neutral",
    urgencyScore: 20,
    confidenceScore: 0.9,
    actionStatus: "answered",
    routingRuleHit: "R6",
    shouldAutoSend: true,
    answer: "Yes — a full refund is available within 7 days.",
    sources: [],
    provider: "heuristic",
    degraded: true,
    duplicate: false,
    classifierError: null,
    decisionSheet: null,
    decisionSheetError: "not_configured",
    ...overrides,
  };
}

export function base64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type FetchCall = { url: string; init: RequestInit | undefined };

export function fetchStub(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { impl: (input: string, init?: RequestInit) => Promise<Response>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  return {
    calls,
    impl: async (input, init) => {
      calls.push({ url: input, init });
      return handler(input, init);
    },
  };
}

export function requestJson(call: FetchCall | undefined): unknown {
  if (!call || call.init?.body === undefined || call.init.body === null) return null;
  return JSON.parse(String(call.init.body)) as unknown;
}

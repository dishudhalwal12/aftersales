// Shared inbound-triage pipeline: retrieve -> classify/draft -> deterministic
// routing -> persist ticket + timeline. Used by the text modal now, and by
// channel webhooks (Phase 3) and voice (Phase 4) later.

import type { Business } from "@prisma/client";

import { ApiError } from "./api";
import { prisma } from "./db";
import { generateTriageResponse, type LLMError } from "./llm-orchestrator";
import { searchMarkdownRag } from "./rag";
import { evaluateRoutingRules, type LLMResponse } from "./routing-engine";

export type TriageChannel = "TEXT_MODAL" | "WHATSAPP" | "INSTAGRAM" | "GMAIL" | "VOICE";

export type TriageInput = {
  business: Business;
  query: string;
  channel: TriageChannel;
  customerName: string;
  customerHandle: string;
  externalMessageId?: string;
};

export type TriageSource = {
  chunkId: string;
  section: string;
  excerpt: string;
};

export type TriageResult = {
  ticketId: string;
  businessId: string;
  specialist: string;
  intent: string;
  sentiment: string;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: string;
  routingRuleHit: string;
  shouldAutoSend: boolean;
  answer: string;
  sources: TriageSource[];
};

export type TriageDependencies = {
  llm?: typeof generateTriageResponse;
};

const FALLBACK_ESCALATION_REPLY =
  "I'm sorry, I can't reliably answer that right now. I've shared your message with our team, and someone will follow up shortly.";

const EXCERPT_LENGTH = 220;

function excerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > EXCERPT_LENGTH
    ? `${compact.slice(0, EXCERPT_LENGTH - 1)}…`
    : compact;
}

function parseCitedChunkIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function channelAllowsAutoSend(business: Business, channel: TriageChannel): Promise<boolean> {
  if (channel === "TEXT_MODAL") {
    return business.autoSendEnabled;
  }

  const channelType = channel === "VOICE" ? "SARVAM_VOICE" : channel;
  const connection = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId: business.id, channelType } },
  });

  if (!connection) return false;
  return connection.autoSend && (connection.status === "CONNECTED" || connection.status === "TEST_MODE");
}

export async function triageInboundMessage(
  input: TriageInput,
  deps: TriageDependencies = {}
): Promise<TriageResult> {
  const llm = deps.llm ?? generateTriageResponse;

  const retrieved = await searchMarkdownRag(input.business.id, input.query, 4);

  // Every chunk of this business is a valid citation target; ids from any
  // other business can never pass this set.
  const businessChunks = await prisma.knowledgeChunk.findMany({
    where: { businessId: input.business.id },
    select: { id: true, section: true, content: true },
  });
  const validChunkIds = new Set(businessChunks.map((chunk) => chunk.id));
  const chunkById = new Map(businessChunks.map((chunk) => [chunk.id, chunk]));

  let llmResult: LLMResponse | null = null;
  let runtimeError = false;

  try {
    llmResult = await llm({
      business: {
        name: input.business.name,
        businessType: input.business.businessType,
        agentTone: input.business.agentTone,
      },
      chunks: retrieved,
      query: input.query,
    });
  } catch (error) {
    runtimeError = true;
    const code = (error as Partial<LLMError>).code ?? "UNKNOWN";
    console.error(
      `[triage] LLM failure (${code}) for business ${input.business.id}:`,
      error instanceof Error ? error.message : error
    );
  }

  const verifiedCitations = (llmResult?.cited_chunk_ids ?? []).filter((id) =>
    validChunkIds.has(id)
  );

  const routing = evaluateRoutingRules({
    llmResult,
    validChunkIdsForBusiness: validChunkIds,
    channelAutoSendAllowed: await channelAllowsAutoSend(input.business, input.channel),
    runtimeError,
  });

  const answer = llmResult?.reply_text ?? FALLBACK_ESCALATION_REPLY;

  const sources: TriageSource[] = verifiedCitations
    .map((chunkId) => {
      const chunk = chunkById.get(chunkId);
      if (!chunk) return null;
      return { chunkId, section: chunk.section, excerpt: excerpt(chunk.content) };
    })
    .filter((source): source is TriageSource => source !== null);

  const specialist = llmResult?.specialist ?? "general";
  const intent = llmResult?.intent ?? "llm_unavailable";
  const sentiment = llmResult?.sentiment ?? "neutral";
  const urgencyScore = llmResult?.urgency_score ?? 0;
  const confidenceScore = llmResult?.confidence_score ?? 0;

  const finalEventType =
    routing.actionStatus === "answered"
      ? "AUTO_SENT"
      : routing.actionStatus === "draft"
        ? "DRAFT_SAVED"
        : "ESCALATED";

  const finalEventPayload =
    routing.actionStatus === "answered"
      ? { reply: answer, citedChunkIds: verifiedCitations }
      : routing.actionStatus === "draft"
        ? { draft: answer, citedChunkIds: verifiedCitations }
        : { reason: routing.ruleHit, failed: runtimeError };

  const now = Date.now();

  const ticket = await prisma.ticket.create({
    data: {
      businessId: input.business.id,
      externalMessageId: input.externalMessageId ?? null,
      channel: input.channel,
      customerName: input.customerName,
      customerHandle: input.customerHandle,
      customerQuery: input.query,
      state: routing.ticketState,
      specialistAssigned: specialist,
      intent,
      sentiment,
      urgencyScore,
      confidenceScore,
      actionStatus: routing.actionStatus,
      routingRuleHit: routing.ruleHit,
      aiDraftOrReply: answer,
      citedChunkIds: JSON.stringify(verifiedCitations),
      events: {
        create: [
          {
            eventType: "INBOUND_RECEIVED",
            payload: JSON.stringify({
              channel: input.channel,
              customerHandle: input.customerHandle,
            }),
            createdAt: new Date(now),
          },
          {
            eventType: "RAG_RETRIEVED",
            payload: JSON.stringify({
              topK: 4,
              chunkIds: retrieved.map((chunk) => chunk.id),
              scores: retrieved.map((chunk) => chunk.score),
            }),
            createdAt: new Date(now + 1),
          },
          {
            eventType: "ROUTING_DECIDED",
            payload: JSON.stringify({
              ruleHit: routing.ruleHit,
              actionStatus: routing.actionStatus,
              shouldAutoSend: routing.shouldAutoSend,
              specialist,
              confidenceScore,
              urgencyScore,
              sentiment,
            }),
            createdAt: new Date(now + 2),
          },
          {
            eventType: finalEventType,
            payload: JSON.stringify(finalEventPayload),
            createdAt: new Date(now + 3),
          },
        ],
      },
    },
  });

  return {
    ticketId: ticket.id,
    businessId: input.business.id,
    specialist,
    intent,
    sentiment,
    urgencyScore,
    confidenceScore,
    actionStatus: routing.actionStatus,
    routingRuleHit: routing.ruleHit,
    shouldAutoSend: routing.shouldAutoSend,
    answer,
    sources,
  };
}

// Rebuilds the API result for a ticket that already exists. Used when a
// duplicate webhook arrives: nothing is re-run, the original decision is
// replayed back to the caller.
export async function getTriageResultForTicket(ticketId: string): Promise<TriageResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new ApiError(404, "NOT_FOUND", "Ticket not found.");
  }

  const citedChunkIds = parseCitedChunkIds(ticket.citedChunkIds);
  const chunks = citedChunkIds.length
    ? await prisma.knowledgeChunk.findMany({
        where: { businessId: ticket.businessId, id: { in: citedChunkIds } },
        select: { id: true, section: true, content: true },
      })
    : [];
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return {
    ticketId: ticket.id,
    businessId: ticket.businessId,
    specialist: ticket.specialistAssigned,
    intent: ticket.intent,
    sentiment: ticket.sentiment,
    urgencyScore: ticket.urgencyScore,
    confidenceScore: ticket.confidenceScore,
    actionStatus: ticket.actionStatus,
    routingRuleHit: ticket.routingRuleHit,
    shouldAutoSend: ticket.actionStatus === "answered",
    answer: ticket.aiDraftOrReply,
    sources: citedChunkIds
      .map((chunkId) => {
        const chunk = chunkById.get(chunkId);
        return chunk
          ? { chunkId, section: chunk.section, excerpt: excerpt(chunk.content) }
          : null;
      })
      .filter((source): source is TriageSource => source !== null),
  };
}

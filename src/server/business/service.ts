/**
 * The one path every inbound contact takes, whatever the channel:
 *   scoped retrieval -> classifier -> deterministic routing -> ticket + events.
 *
 * Keeping it in one function is what makes "one brain behind four channels" true
 * rather than a claim in a README.
 */

import type { Business, KnowledgeChunk, Ticket } from "@prisma/client";
import { prisma } from "../db.ts";
import { classifyAndDraft, type LlmProvider } from "../ai/orchestrator.ts";
import { searchMarkdownRag } from "../ai/rag.ts";
import { evaluateRoutingRules } from "../ai/routing.ts";
import type {
  ActionStatus,
  BrainChunk,
  LlmResponse,
  RetrievedChunk,
  RuleId,
  Specialist,
  TicketChannel,
} from "../../shared/domain.ts";

export interface InboundContact {
  business: Business;
  channel: TicketChannel;
  customerName: string;
  customerHandle: string;
  query: string;
  externalMessageId: string | null;
}

export interface SourceCitation {
  chunkId: string;
  section: string;
  excerpt: string;
}

export interface RespondResult {
  ticketId: string;
  businessId: string;
  specialist: Specialist;
  intent: string;
  sentiment: string;
  urgencyScore: number;
  confidenceScore: number;
  actionStatus: ActionStatus;
  routingRuleHit: RuleId;
  shouldAutoSend: boolean;
  answer: string;
  sources: SourceCitation[];
  provider: LlmProvider;
  degraded: boolean;
  duplicate: boolean;
  classifierError: string | null;
}

const FAILURE_REPLY =
  "The classifier is unavailable right now, so I am not going to guess. A human will follow up on this.";

function toBrainChunks(chunks: KnowledgeChunk[]): BrainChunk[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    chunkIndex: chunk.chunkIndex,
    section: chunk.section,
    content: chunk.content,
    keywords: chunk.keywords,
  }));
}

function excerpt(content: string, limit = 220): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

function citationsFor(ids: readonly string[], retrieved: readonly RetrievedChunk[]): SourceCitation[] {
  const byId = new Map(retrieved.map((chunk) => [chunk.id, chunk]));
  const sources: SourceCitation[] = [];
  for (const id of ids) {
    const chunk = byId.get(id);
    if (chunk) {
      sources.push({ chunkId: chunk.id, section: chunk.section, excerpt: excerpt(chunk.content) });
    }
  }
  return sources;
}

/** Whether this channel may send without a human, for this business. */
export async function channelAutoSendAllowed(
  business: Pick<Business, "id" | "autoSendEnabled">,
  channel: TicketChannel,
): Promise<boolean> {
  if (!business.autoSendEnabled) return false;
  if (channel === "TEXT_MODAL") return true;

  const connection = await prisma.channelConnection.findUnique({
    where: { businessId_channelType: { businessId: business.id, channelType: channel } },
  });
  if (!connection) return false;
  return connection.autoSend && connection.status !== "DRAFT_ONLY" && connection.status !== "UNAVAILABLE";
}

/** Load only this business's chunks. Tenant scoping lives in the WHERE clause. */
export async function loadBusinessChunks(businessId: string): Promise<BrainChunk[]> {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { businessId },
    orderBy: { chunkIndex: "asc" },
  });
  return toBrainChunks(chunks);
}

export interface RespondOverrides {
  /** Forces a fail-safe R7 without touching the provider — used by AT-11 demos. */
  runtimeError?: boolean;
}

export async function respondToContact(
  contact: InboundContact,
  overrides: RespondOverrides = {},
): Promise<RespondResult> {
  const chunks = await loadBusinessChunks(contact.business.id);
  const retrieved = searchMarkdownRag(chunks, contact.query, 4);

  const orchestration = overrides.runtimeError === true
    ? ({ ok: false, provider: "heuristic", error: "runtime failure injected" } as const)
    : await classifyAndDraft({
        business: {
          name: contact.business.name,
          businessType: contact.business.businessType,
          description: contact.business.description,
          productsServices: contact.business.productsServices,
          hours: contact.business.hours,
          returnPolicy: contact.business.returnPolicy,
          faqs: contact.business.faqs,
          escalationEmail: contact.business.escalationEmail,
          escalationPhone: contact.business.escalationPhone,
          agentTone: contact.business.agentTone,
          rawMarkdownUpload: contact.business.rawMarkdownUpload,
        },
        query: contact.query,
        retrieved,
      });

  const provider: LlmProvider = orchestration.provider;
  const degraded = orchestration.ok ? orchestration.degraded : false;
  const llmResult: LlmResponse | null = orchestration.ok ? orchestration.result : null;

  const autoSendAllowed = await channelAutoSendAllowed(contact.business, contact.channel);
  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));

  const decision = evaluateRoutingRules({
    llmResult,
    validChunkIdsForBusiness: validChunkIds,
    channelAutoSendAllowed: autoSendAllowed,
    runtimeError: !orchestration.ok,
  });

  const cited = llmResult?.cited_chunk_ids ?? [];
  const sources = citationsFor(cited.filter((id) => validChunkIds.has(id)), retrieved);

  const specialist: Specialist = llmResult?.specialist ?? "general";
  const intent = llmResult?.intent ?? "classifier_failure";
  const sentiment = llmResult?.sentiment ?? "neutral";
  const urgencyScore = llmResult?.urgency_score ?? 0;
  const confidenceScore = llmResult?.confidence_score ?? 0;
  const answer = llmResult?.reply_text && llmResult.reply_text.length > 0
    ? llmResult.reply_text
    : FAILURE_REPLY;

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const row = await tx.ticket.create({
        data: {
          businessId: contact.business.id,
          externalMessageId: contact.externalMessageId,
          channel: contact.channel,
          customerName: contact.customerName,
          customerHandle: contact.customerHandle,
          customerQuery: contact.query,
          state: decision.ticketState,
          specialistAssigned: specialist,
          intent,
          sentiment,
          urgencyScore,
          confidenceScore,
          actionStatus: decision.actionStatus,
          routingRuleHit: decision.ruleHit,
          aiDraftOrReply: answer,
          citedChunkIds: JSON.stringify(sources.map((source) => source.chunkId)),
        },
      });

      const basePayload = {
        channel: contact.channel,
        externalMessageId: contact.externalMessageId,
      };
      await tx.ticketEvent.create({
        data: {
          ticketId: row.id,
          eventType: "INBOUND_RECEIVED",
          payload: JSON.stringify(basePayload),
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: row.id,
          eventType: "RAG_RETRIEVED",
          payload: JSON.stringify({
            retrieved: retrieved.map((chunk) => ({ id: chunk.id, score: chunk.score })),
            provider,
            degraded,
          }),
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: row.id,
          eventType: "ROUTING_DECIDED",
          payload: JSON.stringify({
            rule: decision.ruleHit,
            actionStatus: decision.actionStatus,
            shouldAutoSend: decision.shouldAutoSend,
            confidence: confidenceScore,
            urgency: urgencyScore,
            sentiment,
            channelAutoSendAllowed: autoSendAllowed,
            classifierError: orchestration.ok ? null : orchestration.error,
          }),
        },
      });

      const outcomeEvent =
        decision.actionStatus === "answered"
          ? "AUTO_SENT"
          : decision.actionStatus === "draft"
            ? "DRAFT_SAVED"
            : decision.actionStatus === "escalated"
              ? "ESCALATED"
              : "CLASSIFIER_FAILED";

      await tx.ticketEvent.create({
        data: {
          ticketId: row.id,
          eventType: outcomeEvent,
          payload: JSON.stringify({
            rule: decision.ruleHit,
            citedChunkIds: sources.map((source) => source.chunkId),
            answer,
          }),
        },
      });

      return row;
    });

    return {
      ticketId: ticket.id,
      businessId: contact.business.id,
      specialist,
      intent,
      sentiment,
      urgencyScore,
      confidenceScore,
      actionStatus: decision.actionStatus,
      routingRuleHit: decision.ruleHit,
      shouldAutoSend: decision.shouldAutoSend,
      answer,
      sources,
      provider,
      degraded,
      duplicate: false,
      classifierError: orchestration.ok ? null : orchestration.error,
    };
  } catch (error) {
    // AT-10: the unique index on (businessId, externalMessageId) is the idempotency key.
    if (isUniqueViolation(error) && contact.externalMessageId) {
      const existing = await prisma.ticket.findUnique({
        where: {
          businessId_externalMessageId: {
            businessId: contact.business.id,
            externalMessageId: contact.externalMessageId,
          },
        },
      });
      if (existing) return toDuplicateResult(existing, provider, degraded);
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function toDuplicateResult(
  ticket: Ticket,
  provider: LlmProvider,
  degraded: boolean,
): RespondResult {
  let cited: string[] = [];
  try {
    const parsed = JSON.parse(ticket.citedChunkIds) as unknown;
    if (Array.isArray(parsed)) cited = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    cited = [];
  }

  return {
    ticketId: ticket.id,
    businessId: ticket.businessId,
    specialist: ticket.specialistAssigned as Specialist,
    intent: ticket.intent,
    sentiment: ticket.sentiment,
    urgencyScore: ticket.urgencyScore,
    confidenceScore: ticket.confidenceScore,
    actionStatus: ticket.actionStatus as ActionStatus,
    routingRuleHit: ticket.routingRuleHit as RuleId,
    shouldAutoSend: false,
    answer: ticket.aiDraftOrReply,
    sources: [],
    provider,
    degraded,
    duplicate: true,
    classifierError: null,
  };
}

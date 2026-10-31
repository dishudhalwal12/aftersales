/**
 * Business creation and brain compilation (PRD §5.1).
 * Chunks are always derived from `compiledBrainMd` so the markdown stays the
 * source of truth and the chunk rows stay rebuildable.
 */

import type { Business } from "@prisma/client";
import { prisma } from "../db.ts";
import { chunkMarkdown, compileBrainMd } from "../ai/rag.ts";
import type { BusinessFacts } from "../../shared/domain.ts";

export interface OnboardingInput extends BusinessFacts {}

export interface CreateBusinessResult {
  businessId: string;
  name: string;
  brainVersion: number;
  chunkCount: number;
}

export const DEFAULT_CHANNELS: ReadonlyArray<{ type: string; status: string; autoSend: boolean }> = [
  // A new business may answer WhatsApp automatically as soon as a device is
  // linked: the channel-level floor (confidence 50 + a verified citation, R2/R6)
  // still decides every message, so "auto-send on" cannot mean "always sends".
  { type: "WHATSAPP", status: "TEST_MODE", autoSend: true },
  { type: "FACEBOOK", status: "UNAVAILABLE", autoSend: false },
  { type: "INSTAGRAM", status: "DRAFT_ONLY", autoSend: false },
  { type: "GMAIL", status: "TEST_MODE", autoSend: false },
  { type: "SARVAM_VOICE", status: "TEST_MODE", autoSend: false },
];

export async function createBusinessForOwner(
  ownerId: string,
  input: OnboardingInput,
): Promise<CreateBusinessResult> {
  const compiledBrainMd = compileBrainMd(input);
  const chunks = chunkMarkdown(compiledBrainMd);

  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({
      data: {
        ownerId,
        name: input.name,
        businessType: input.businessType,
        description: input.description,
        productsServices: input.productsServices,
        hours: input.hours,
        returnPolicy: input.returnPolicy,
        faqs: input.faqs,
        escalationEmail: input.escalationEmail,
        escalationPhone: input.escalationPhone,
        agentTone: input.agentTone,
        autoSendEnabled: true,
        compiledBrainMd,
        brainVersion: 1,
        rawMarkdownUpload: input.rawMarkdownUpload,
        chunks: {
          create: chunks.map((chunk, index) => ({
            chunkIndex: index,
            section: chunk.section,
            content: chunk.content,
            keywords: chunk.keywords,
          })),
        },
        channels: {
          create: DEFAULT_CHANNELS.map((channel) => ({
            channelType: channel.type,
            status: channel.status,
            autoSend: channel.autoSend,
            configJson: JSON.stringify({ mode: channel.status.toLowerCase() }),
          })),
        },
        // The call-script row exists from the first save, so the voice context
        // document is complete before a call. Identifiers stay null on purpose:
        // one agent id or number may map to exactly one tenant, so the owner
        // binds them from Dashboard → Voice rather than inheriting a shared one.
        voiceAgentContext: { create: {} },
      },
    });
    return created;
  });

  return {
    businessId: business.id,
    name: business.name,
    brainVersion: business.brainVersion,
    chunkCount: chunks.length,
  };
}

export async function recompileBrain(
  business: Business,
  markdown: string,
): Promise<{ brainVersion: number; chunkCount: number }> {
  const normalized = markdown.trim();
  const chunks = chunkMarkdown(normalized);
  const brainVersion = business.brainVersion + 1;

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { businessId: business.id } });
    if (chunks.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk, index) => ({
          businessId: business.id,
          chunkIndex: index,
          section: chunk.section,
          content: chunk.content,
          keywords: chunk.keywords,
        })),
      });
    }
    await tx.business.update({
      where: { id: business.id },
      data: { compiledBrainMd: normalized, brainVersion },
    });
  });

  return { brainVersion, chunkCount: chunks.length };
}

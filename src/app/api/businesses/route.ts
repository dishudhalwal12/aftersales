import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { CHANNEL_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { buildBusinessBrain } from "@/lib/rag";

export const dynamic = "force-dynamic";

const phonePattern = /^\+?[0-9][0-9\s-]{6,19}$/;

const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Business name is required.").max(120),
  businessType: z.string().trim().min(1, "Business type is required.").max(80),
  description: z.string().trim().min(1, "Description is required.").max(4000),
  productsServices: z.string().trim().min(1, "Products & pricing are required.").max(8000),
  hours: z.string().trim().min(1, "Business hours are required.").max(2000),
  returnPolicy: z.string().trim().min(1, "Return/refund policy is required.").max(4000),
  faqs: z.string().trim().min(1, "FAQs are required.").max(8000),
  escalationEmail: z.string().trim().toLowerCase().email("Escalation email must be valid."),
  escalationPhone: z
    .string()
    .trim()
    .regex(phonePattern, "Escalation phone must be a valid phone number."),
  agentTone: z.string().trim().max(200).optional(),
  rawMarkdownUpload: z.string().max(100_000).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();

    const businesses = await prisma.business.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        channels: {
          select: { channelType: true, status: true, autoSend: true },
          orderBy: { channelType: "asc" },
        },
        _count: { select: { chunks: true, tickets: true } },
      },
    });

    return jsonOk({
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        businessType: business.businessType,
        description: business.description,
        agentTone: business.agentTone,
        brainVersion: business.brainVersion,
        autoSendEnabled: business.autoSendEnabled,
        chunkCount: business._count.chunks,
        ticketCount: business._count.tickets,
        channels: business.channels,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = onboardingSchema.parse(await parseJsonBody(request));

    const { brainMd, chunks } = buildBusinessBrain({
      ...body,
      agentTone: body.agentTone ?? "Warm, concise, and helpful",
      rawMarkdownUpload: body.rawMarkdownUpload ?? "",
    });

    const business = await prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          ownerId: user.id,
          name: body.name,
          businessType: body.businessType,
          description: body.description,
          productsServices: body.productsServices,
          hours: body.hours,
          returnPolicy: body.returnPolicy,
          faqs: body.faqs,
          escalationEmail: body.escalationEmail,
          escalationPhone: body.escalationPhone,
          agentTone: body.agentTone ?? "Warm, concise, and helpful",
          compiledBrainMd: brainMd,
          brainVersion: 1,
        },
      });

      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          businessId: created.id,
          chunkIndex: chunk.chunkIndex,
          section: chunk.section,
          content: chunk.content,
          keywords: chunk.keywords,
        })),
      });

      // Channels start disconnected and non-sending until the owner explicitly
      // connects them — never claim a channel is live before it is.
      await tx.channelConnection.createMany({
        data: CHANNEL_TYPES.map((channelType) => ({
          businessId: created.id,
          channelType,
          status: "UNAVAILABLE",
          autoSend: false,
        })),
      });

      return created;
    });

    return jsonOk(
      {
        businessId: business.id,
        name: business.name,
        brainVersion: business.brainVersion,
        chunkCount: chunks.length,
      },
      201
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

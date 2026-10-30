import { jsonOk, toErrorResponse } from "@/lib/api";
import { assertBusinessOwnership, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function wordCount(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const business = await assertBusinessOwnership(user.id, id);

    const chunks = await prisma.knowledgeChunk.findMany({
      where: { businessId: business.id },
      orderBy: { chunkIndex: "asc" },
    });

    return jsonOk({
      businessId: business.id,
      name: business.name,
      businessType: business.businessType,
      agentTone: business.agentTone,
      brainVersion: business.brainVersion,
      chunkCount: chunks.length,
      compiledBrainMd: business.compiledBrainMd,
      updatedAt: business.updatedAt,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        section: chunk.section,
        content: chunk.content,
        keywords: chunk.keywords,
        wordCount: wordCount(chunk.content),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

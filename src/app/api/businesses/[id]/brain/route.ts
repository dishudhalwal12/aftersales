import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db.ts";
import { recompileBrain } from "../../../../../lib/business-admin.ts";
import { errorResponse, loadOwnedBusiness, readJson, requireUser } from "../../../../../lib/tenant.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/businesses/[id]/brain — compiled markdown plus its citable chunks. */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);

    const chunks = await prisma.knowledgeChunk.findMany({
      where: { businessId: business.id },
      orderBy: { chunkIndex: "asc" },
      select: { id: true, chunkIndex: true, section: true, content: true, keywords: true },
    });

    return NextResponse.json({
      businessId: business.id,
      businessName: business.name,
      brainVersion: business.brainVersion,
      compiledBrainMd: business.compiledBrainMd,
      chunkCount: chunks.length,
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        section: chunk.section,
        content: chunk.content,
        keywords: chunk.keywords.split(",").slice(0, 12),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/businesses/[id]/brain — edit the markdown, bump the version. */
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const business = await loadOwnedBusiness(user.id, id);
    const body = await readJson(request);

    const markdown = body["compiledBrainMd"];
    if (typeof markdown !== "string" || markdown.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: 'field "compiledBrainMd" is required' } },
        { status: 400 },
      );
    }
    if (markdown.length > 40000) {
      return NextResponse.json(
        { error: { code: 400, message: "brain document is too large (40000 char limit)" } },
        { status: 400 },
      );
    }

    const result = await recompileBrain(business, markdown);
    return NextResponse.json({
      businessId: business.id,
      brainVersion: result.brainVersion,
      chunkCount: result.chunkCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

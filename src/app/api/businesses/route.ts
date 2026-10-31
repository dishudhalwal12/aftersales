import { NextResponse } from "next/server";
import { prisma } from "../../../server/db.ts";
import { createBusinessForOwner } from "../../../server/business/admin.ts";
import {
  errorResponse,
  readJson,
  requireString,
  requireUser,
} from "../../../server/auth/tenant.ts";
import { HttpError } from "../../../server/auth/tenant.ts";
import { FACT_LIMITS } from "../../../shared/fact-limits.ts";

export const dynamic = "force-dynamic";

/** GET /api/businesses — every business the signed-in owner can switch to. */
export async function GET() {
  try {
    const user = await requireUser();
    const businesses = await prisma.business.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        businessType: true,
        brainVersion: true,
        autoSendEnabled: true,
        _count: { select: { chunks: true, tickets: true } },
      },
    });

    return NextResponse.json({
      businesses: businesses.map((business) => ({
        businessId: business.id,
        name: business.name,
        businessType: business.businessType,
        brainVersion: business.brainVersion,
        autoSendEnabled: business.autoSendEnabled,
        chunkCount: business._count.chunks,
        ticketCount: business._count.tickets,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/businesses — save onboarding and compile the brain (PRD §5.1). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);

    const name = requireString(body, "name", { max: FACT_LIMITS.name });
    const businessType = requireString(body, "businessType", { max: FACT_LIMITS.businessType });
    const description = requireString(body, "description", { max: FACT_LIMITS.description });
    const productsServices = requireString(body, "productsServices", {
      max: FACT_LIMITS.productsServices,
    });
    const hours = requireString(body, "hours", { max: FACT_LIMITS.hours });
    const returnPolicy = requireString(body, "returnPolicy", { max: FACT_LIMITS.returnPolicy });
    const faqs = requireString(body, "faqs", { max: FACT_LIMITS.faqs });
    const escalationEmail = requireString(body, "escalationEmail", {
      max: FACT_LIMITS.escalationEmail,
    });
    const escalationPhone = requireString(body, "escalationPhone", {
      max: FACT_LIMITS.escalationPhone,
    });
    const agentTone = requireString(body, "agentTone", {
      max: FACT_LIMITS.agentTone,
      optional: true,
    });
    const rawMarkdownUpload = requireString(body, "rawMarkdownUpload", {
      max: FACT_LIMITS.rawMarkdownUpload,
      optional: true,
    });

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(escalationEmail)) {
      throw new HttpError(400, 'field "escalationEmail" must be a valid email address');
    }

    const created = await createBusinessForOwner(user.id, {
      name,
      businessType,
      description,
      productsServices,
      hours,
      returnPolicy,
      faqs,
      escalationEmail,
      escalationPhone,
      agentTone: agentTone.length > 0 ? agentTone : "Warm, concise, and helpful",
      rawMarkdownUpload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

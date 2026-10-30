import bcrypt from "bcryptjs";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await parseJsonBody(request));

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return jsonError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name ?? null,
        passwordHash,
      },
    });

    return jsonOk({ userId: user.id, email: user.email }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

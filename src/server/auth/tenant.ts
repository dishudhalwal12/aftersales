import { NextResponse } from "next/server";
import type { Business } from "@prisma/client";
import { prisma } from "../db.ts";
import { getCurrentUser, type SessionUser } from "./session.ts";

/** A status-carrying error the API layer knows how to serialize. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Tenant boundary. A business is only readable by the user who owns it —
 * every API route goes through here, never through a caller-supplied owner id.
 */
export async function loadOwnedBusiness(userId: string, businessId: string): Promise<Business> {
  if (!businessId) throw new HttpError(400, "businessId is required");

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new HttpError(404, "business not found");
  if (business.ownerId !== userId) {
    throw new HttpError(403, "forbidden: this business belongs to another tenant");
  }
  return business;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "not authenticated");
  return user;
}

/** Serialize any thrown value into the frozen API error shape. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: { code: error.status, message: error.message } },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "unexpected error";
  // Never leak a stack or a connection string to the client.
  console.error("[api] unhandled error:", message);
  return NextResponse.json(
    { error: { code: 500, message: "internal server error" } },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new HttpError(400, "request body must be a JSON object");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "request body must be valid JSON");
  }
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
  options: { max?: number; optional?: boolean } = {},
): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    if (options.optional === true) return "";
    throw new HttpError(400, `field "${key}" is required`);
  }
  const trimmed = value.trim();
  if (options.max !== undefined && trimmed.length > options.max) {
    throw new HttpError(400, `field "${key}" exceeds ${options.max} characters`);
  }
  return trimmed;
}

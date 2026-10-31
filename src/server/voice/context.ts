/**
 * Business voice-agent context.
 *
 * The business brain (`Business` + `KnowledgeChunk`) is a retrieval corpus, not
 * a call script. This module owns the extra facts a phone agent needs (address,
 * holidays, languages, appointment policy, free-form instructions) and — the
 * security-critical part — the trusted mapping from a Sarvam `agent_id` /
 * virtual number back to exactly one tenant.
 *
 * Nothing here trusts a caller-supplied business id. A caller must present a
 * shared secret and an identifier that the database says belongs to one
 * business; anything else is an error, never a best guess.
 */

import { timingSafeEqual } from "node:crypto";
import type { Business, BusinessVoiceAgentContext } from "@prisma/client";
import { prisma } from "../db.ts";
import { HttpError } from "../auth/http-error.ts";
import { chunkMarkdown, compileBrainMd } from "../ai/rag.ts";
import { buildCallVariables, type VoiceCallContext } from "./sarvam.ts";
import type { CustomizationVariables } from "./customizations.ts";
import type { BusinessFacts } from "../../shared/domain.ts";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const MAX_WEEKDAYS = WEEKDAYS.length;
const MAX_LANGUAGES = 12;
const MAX_LANGUAGE_LENGTH = 40;

/** Control characters never belong in context text; they only break prompts/logs. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface VoiceAgentContextFields {
  businessAddress: string;
  weeklyHolidays: string[];
  supportedLanguages: string[];
  appointmentPolicy: string;
  agentInstructions: string;
  virtualNumber: string | null;
  agentId: string | null;
  isActive: boolean;
}

export interface VoiceAgentContextView extends VoiceAgentContextFields {
  businessId: string;
  updatedAt: string | null;
}

export interface ComposedVoiceContext {
  businessId: string;
  businessName: string;
  businessType: string;
  businessDescription: string;
  businessAddress: string;
  productsServices: string;
  openingHours: string;
  weeklyHolidays: string[];
  supportedLanguages: string[];
  faqs: string;
  appointmentPolicy: string;
  returnPolicy: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  agentInstructions: string;
  virtualNumber: string | null;
  agentId: string | null;
  isActive: boolean;
}

function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, "").trim();
}

function readText(
  body: Record<string, unknown>,
  key: string,
  max: number,
  fallback = "",
): string {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new HttpError(400, `field "${key}" must be a string`);
  const text = sanitizeText(value);
  if (text.length > max) {
    throw new HttpError(400, `field "${key}" exceeds ${max} characters`);
  }
  return text;
}

/**
 * Accepts an array or a comma/newline-separated string, trims, deduplicates
 * case-insensitively, and caps the list. Keeps the caller's spelling.
 */
function readList(
  value: unknown,
  key: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (value === undefined || value === null) return [];
  const raw = typeof value === "string" ? value.split(/[,\n]/) : value;
  if (!Array.isArray(raw)) {
    throw new HttpError(400, `field "${key}" must be an array of strings`);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new HttpError(400, `field "${key}" must contain only strings`);
    }
    const text = sanitizeText(entry);
    if (text.length === 0) continue;
    if (text.length > maxLength) {
      throw new HttpError(400, `each "${key}" entry must be at most ${maxLength} characters`);
    }
    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(text);
  }

  if (result.length > maxItems) {
    throw new HttpError(400, `field "${key}" accepts at most ${maxItems} entries`);
  }
  return result;
}

function readWeekdays(value: unknown): string[] {
  const entries = readList(value, "weeklyHolidays", MAX_WEEKDAYS, 20);
  const canonical = new Map<string, string>(WEEKDAYS.map((day) => [day.toLowerCase(), day]));
  return entries.map((entry) => {
    const day = canonical.get(entry.toLowerCase());
    if (day === undefined) {
      throw new HttpError(
        400,
        'field "weeklyHolidays" accepts weekday names (Monday through Sunday)',
      );
    }
    return day;
  });
}

/** E.164-ish: an optional `+`, 8–15 digits, and no leading zero after the country code. */
export function normalizePhoneNumber(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  const match = /^\+?(\d{8,15})$/.exec(compact);
  if (!match) return null;
  const digits = match[1] ?? "";
  if (digits.startsWith("0")) return null;
  return `+${digits}`;
}

function readPhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, 'field "virtualNumber" must be a string');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const normalized = normalizePhoneNumber(trimmed);
  if (normalized === null) {
    throw new HttpError(400, 'field "virtualNumber" must be an E.164 phone number, e.g. +918047123456');
  }
  return normalized;
}

function readAgentId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, 'field "agentId" must be a string');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(trimmed)) {
    throw new HttpError(400, 'field "agentId" may contain letters, digits, ".", "_", ":" and "-"');
  }
  return trimmed;
}

/** Trusted identifiers as they arrive on the Sarvam on-start tool. */
export function parseTrustedIdentifiers(body: Record<string, unknown>): {
  agentId: string | null;
  virtualNumber: string | null;
} {
  return {
    agentId: readAgentId(body["agentId"]),
    virtualNumber: readPhone(body["virtualNumber"]),
  };
}

const REQUIRED_FACT_KEYS = ["name", "businessType", "description", "productsServices", "hours"] as const;

const FACT_LIMITS: Readonly<Record<keyof BusinessFacts, number>> = {
  name: 120,
  businessType: 60,
  description: 2_000,
  productsServices: 4_000,
  hours: 500,
  returnPolicy: 2_000,
  faqs: 8_000,
  escalationEmail: 160,
  escalationPhone: 40,
  agentTone: 160,
  rawMarkdownUpload: 40_000,
};

function readFactsPatch(body: Record<string, unknown>): Partial<BusinessFacts> {
  const patch: Partial<BusinessFacts> = {};
  for (const key of Object.keys(FACT_LIMITS) as Array<keyof BusinessFacts>) {
    if (key === "rawMarkdownUpload") continue;
    if (body[key] === undefined) continue;
    const value = readText(body, key, FACT_LIMITS[key]);
    const required = (REQUIRED_FACT_KEYS as readonly string[]).includes(key);
    if (required && value.length === 0) throw new HttpError(400, `field "${key}" is required`);
    if (key === "escalationEmail" && value.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      throw new HttpError(400, 'field "escalationEmail" must be an email address');
    }
    if (key === "escalationPhone" && value.length > 0 && normalizePhoneNumber(value) === null) {
      throw new HttpError(400, 'field "escalationPhone" must be an E.164 phone number');
    }
    patch[key] = value;
  }
  return patch;
}

export interface ParsedVoiceContextBody {
  context: VoiceAgentContextFields;
  businessPatch: Partial<BusinessFacts>;
}

/**
 * PUT semantics for the context fields (absent means blank/null/active), with
 * one exception: core business facts are only touched when the key is present,
 * so saving the call script cannot wipe the brain by omission.
 */
export function parseVoiceContextBody(body: Record<string, unknown>): ParsedVoiceContextBody {
  const isActive = body["isActive"];
  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new HttpError(400, 'field "isActive" must be a boolean');
  }

  return {
    context: {
      businessAddress: readText(body, "businessAddress", 300),
      weeklyHolidays: readWeekdays(body["weeklyHolidays"]),
      supportedLanguages: readList(body["supportedLanguages"], "supportedLanguages", MAX_LANGUAGES, MAX_LANGUAGE_LENGTH),
      appointmentPolicy: readText(body, "appointmentPolicy", 1_000),
      agentInstructions: readText(body, "agentInstructions", 2_000),
      virtualNumber: readPhone(body["virtualNumber"]),
      agentId: readAgentId(body["agentId"]),
      isActive: isActive === undefined ? true : isActive,
    },
    businessPatch: readFactsPatch(body),
  };
}

function parseStoredList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function toVoiceAgentContextView(row: BusinessVoiceAgentContext): VoiceAgentContextView {
  return {
    businessId: row.businessId,
    businessAddress: row.businessAddress,
    weeklyHolidays: parseStoredList(row.weeklyHolidays),
    supportedLanguages: parseStoredList(row.supportedLanguages),
    appointmentPolicy: row.appointmentPolicy,
    agentInstructions: row.agentInstructions,
    virtualNumber: row.virtualNumber,
    agentId: row.agentId,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const EMPTY_CONTEXT: VoiceAgentContextFields = {
  businessAddress: "",
  weeklyHolidays: [],
  supportedLanguages: [],
  appointmentPolicy: "",
  agentInstructions: "",
  virtualNumber: null,
  agentId: null,
  isActive: true,
};

export function contextFromRow(
  row: BusinessVoiceAgentContext | null,
): VoiceAgentContextFields {
  if (row === null) return { ...EMPTY_CONTEXT, weeklyHolidays: [], supportedLanguages: [] };
  return {
    businessAddress: row.businessAddress,
    weeklyHolidays: parseStoredList(row.weeklyHolidays),
    supportedLanguages: parseStoredList(row.supportedLanguages),
    appointmentPolicy: row.appointmentPolicy,
    agentInstructions: row.agentInstructions,
    virtualNumber: row.virtualNumber,
    agentId: row.agentId,
    isActive: row.isActive,
  };
}

export function composeVoiceContext(
  business: Business,
  row: BusinessVoiceAgentContext | null,
): ComposedVoiceContext {
  const fields = contextFromRow(row);
  return {
    businessId: business.id,
    businessName: business.name,
    businessType: business.businessType,
    businessDescription: business.description,
    businessAddress: fields.businessAddress,
    productsServices: business.productsServices,
    openingHours: business.hours,
    weeklyHolidays: fields.weeklyHolidays,
    supportedLanguages: fields.supportedLanguages,
    faqs: business.faqs,
    appointmentPolicy: fields.appointmentPolicy,
    returnPolicy: business.returnPolicy,
    escalationEmail: business.escalationEmail,
    escalationPhone: business.escalationPhone,
    agentTone: business.agentTone,
    agentInstructions: fields.agentInstructions,
    virtualNumber: fields.virtualNumber,
    agentId: fields.agentId,
    isActive: fields.isActive,
  };
}

export function voiceCallContext(
  business: Business,
  row: BusinessVoiceAgentContext | null,
  customizations?: CustomizationVariables | null,
): Record<string, string> {
  const composed = composeVoiceContext(business, row);
  const callContext: VoiceCallContext = {
    businessAddress: composed.businessAddress,
    weeklyHolidays: composed.weeklyHolidays,
    supportedLanguages: composed.supportedLanguages,
    appointmentPolicy: composed.appointmentPolicy,
    agentInstructions: composed.agentInstructions,
  };
  return buildCallVariables(business, callContext, customizations ?? null);
}

// ---------------------------------------------------------------------------
// Trusted identifier resolution
// ---------------------------------------------------------------------------

export interface VoiceMappingCandidate {
  businessId: string;
  agentId: string | null;
  virtualNumber: string | null;
  isActive: boolean;
}

function uniqueByBusiness(rows: VoiceMappingCandidate[]): VoiceMappingCandidate[] {
  const seen = new Map<string, VoiceMappingCandidate>();
  for (const row of rows) {
    if (!seen.has(row.businessId)) seen.set(row.businessId, row);
  }
  return [...seen.values()];
}

/**
 * Pure resolution over rows the caller already loaded. Throws `HttpError` with
 * 400/404/409 — never returns "the first match", because that is exactly how a
 * call ends up answered with another tenant's facts.
 */
export function resolveVoiceMapping(input: {
  agentId: string | null;
  virtualNumber: string | null;
  agentMatches: VoiceMappingCandidate[];
  numberMatches: VoiceMappingCandidate[];
}): VoiceMappingCandidate {
  const { agentId, virtualNumber } = input;
  if (agentId === null && virtualNumber === null) {
    throw new HttpError(400, "agentId or virtualNumber is required to resolve a business");
  }

  const agentRows = uniqueByBusiness(input.agentMatches);
  const numberRows = uniqueByBusiness(input.numberMatches);

  let candidates: VoiceMappingCandidate[];
  if (agentId !== null && virtualNumber !== null) {
    if (agentRows.length === 0 || numberRows.length === 0) {
      throw new HttpError(404, "no business is mapped to the supplied voice identifiers");
    }
    const numbersById = new Map(numberRows.map((row) => [row.businessId, row]));
    candidates = agentRows.filter((row) => numbersById.has(row.businessId));
    if (candidates.length === 0) {
      throw new HttpError(409, "the agent id and virtual number belong to different businesses");
    }
  } else {
    candidates = agentId !== null ? agentRows : numberRows;
    if (candidates.length === 0) {
      throw new HttpError(404, "no business is mapped to the supplied voice identifier");
    }
  }

  if (candidates.length > 1) {
    throw new HttpError(409, "more than one business is mapped to the supplied voice identifier");
  }

  const match = candidates[0];
  if (match === undefined) {
    throw new HttpError(404, "no business is mapped to the supplied voice identifier");
  }
  if (!match.isActive) {
    throw new HttpError(409, "voice agent context is inactive for this business");
  }
  return match;
}

export async function resolveVoiceBusiness(agentId: string | null, virtualNumber: string | null) {
  const select = {
    businessId: true,
    agentId: true,
    virtualNumber: true,
    isActive: true,
  } as const;

  const [agentMatches, numberMatches] = await Promise.all([
    agentId === null
      ? Promise.resolve([] as VoiceMappingCandidate[])
      : prisma.businessVoiceAgentContext.findMany({ where: { agentId }, select }),
    virtualNumber === null
      ? Promise.resolve([] as VoiceMappingCandidate[])
      : prisma.businessVoiceAgentContext.findMany({ where: { virtualNumber }, select }),
  ]);

  return resolveVoiceMapping({ agentId, virtualNumber, agentMatches, numberMatches });
}

export type CallResolutionMethod =
  | "agent_id"
  | "virtual_number"
  | "agent_id+virtual_number"
  | "session";

export interface CallResolution {
  businessId: string;
  resolvedBy: CallResolutionMethod;
  session: { id: string; businessId: string; demoPin: string; expiresAt: Date } | null;
}

/**
 * One resolver for every voice call surface (context tool, request capture).
 * Trusted identifiers win; session/PIN is the demo fallback. A body-level
 * business id is never read.
 */
export async function resolveCallBusiness(input: {
  agentId: string | null;
  virtualNumber: string | null;
  sessionId: string;
  demoPin: string;
}): Promise<CallResolution> {
  const { agentId, virtualNumber, sessionId, demoPin } = input;
  const hasTrustedIdentifier = agentId !== null || virtualNumber !== null;

  if (!hasTrustedIdentifier && sessionId.length === 0 && demoPin.length === 0) {
    throw new HttpError(400, "agentId, virtualNumber, sessionId or demoPin is required");
  }

  if (hasTrustedIdentifier) {
    const match = await resolveVoiceBusiness(agentId, virtualNumber);
    return {
      businessId: match.businessId,
      resolvedBy:
        agentId !== null && virtualNumber !== null
          ? "agent_id+virtual_number"
          : agentId !== null
            ? "agent_id"
            : "virtual_number",
      session: null,
    };
  }

  const session = await prisma.voiceTestSession.findFirst({
    where: {
      ...(sessionId.length > 0 ? { id: sessionId } : {}),
      ...(demoPin.length > 0 ? { demoPin } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, businessId: true, demoPin: true, expiresAt: true },
  });
  if (!session) throw new HttpError(404, "voice session not found");

  return { businessId: session.businessId, resolvedBy: "session", session };
}

// ---------------------------------------------------------------------------
// Shared secret
// ---------------------------------------------------------------------------

export const VOICE_CONTEXT_AUTH_HEADERS = [
  "x-saram-token",
  "x-sarvam-token",
  "x-sarvam-context-token",
] as const;

export type EnvLookup = Readonly<Record<string, string | undefined>>;

export function readVoiceContextSecret(env: EnvLookup = process.env): string {
  const dedicated = (env["SARVAM_CONTEXT_TOKEN"] ?? "").trim();
  if (dedicated.length > 0) return dedicated;
  return (env["SARVAM_WEBHOOK_TOKEN"] ?? "").trim();
}

export function presentedVoiceContextSecret(headers: Headers): string {
  for (const name of VOICE_CONTEXT_AUTH_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value.trim().length > 0) return value.trim();
  }
  const authorization = headers.get("authorization");
  if (authorization !== null && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return "";
}

export function verifyVoiceContextSecret(presented: string, expected: string): boolean {
  if (expected.length === 0 || presented.length === 0) return false;
  const left = Buffer.from(presented, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface VoiceContextAuth {
  configured: boolean;
  authorized: boolean;
  mode: "shared-secret" | "unconfigured";
}

/**
 * An unconfigured secret is reported, not hidden: the response says the
 * deployment is running without context auth so nobody mistakes it for secured.
 */
export function authorizeVoiceContext(
  headers: Headers,
  env: EnvLookup = process.env,
): VoiceContextAuth {
  const expected = readVoiceContextSecret(env);
  if (expected.length === 0) return { configured: false, authorized: true, mode: "unconfigured" };
  return {
    configured: true,
    authorized: verifyVoiceContextSecret(presentedVoiceContextSecret(headers), expected),
    mode: "shared-secret",
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function loadVoiceAgentContext(
  businessId: string,
): Promise<BusinessVoiceAgentContext | null> {
  return prisma.businessVoiceAgentContext.findUnique({ where: { businessId } });
}

export interface SaveVoiceAgentContextResult {
  context: VoiceAgentContextView;
  brainVersion: number;
  chunkCount: number;
  recompiled: boolean;
}

async function assertMappingAvailable(
  businessId: string,
  context: VoiceAgentContextFields,
): Promise<void> {
  if (context.virtualNumber !== null) {
    const clash = await prisma.businessVoiceAgentContext.findFirst({
      where: { virtualNumber: context.virtualNumber, businessId: { not: businessId } },
      select: { businessId: true },
    });
    if (clash !== null) {
      throw new HttpError(409, "this virtual number is already mapped to another business");
    }
  }
  if (context.agentId !== null) {
    const clash = await prisma.businessVoiceAgentContext.findFirst({
      where: { agentId: context.agentId, businessId: { not: businessId } },
      select: { businessId: true },
    });
    if (clash !== null) {
      throw new HttpError(409, "this agent id is already mapped to another business");
    }
  }
}

const FACT_KEYS = Object.keys(FACT_LIMITS).filter(
  (key): key is Exclude<keyof BusinessFacts, "rawMarkdownUpload"> => key !== "rawMarkdownUpload",
);

/**
 * Saves the context row and, only when a core fact actually changed, rebuilds
 * the brain chunks in the same transaction so the voice corpus and the text
 * corpus can never disagree.
 */
export async function saveVoiceAgentContext(
  business: Business,
  input: ParsedVoiceContextBody,
): Promise<SaveVoiceAgentContextResult> {
  await assertMappingAvailable(business.id, input.context);

  const changedFacts = FACT_KEYS.filter(
    (key) => input.businessPatch[key] !== undefined && input.businessPatch[key] !== business[key],
  );
  const nextFacts: BusinessFacts = {
    name: input.businessPatch.name ?? business.name,
    businessType: input.businessPatch.businessType ?? business.businessType,
    description: input.businessPatch.description ?? business.description,
    productsServices: input.businessPatch.productsServices ?? business.productsServices,
    hours: input.businessPatch.hours ?? business.hours,
    returnPolicy: input.businessPatch.returnPolicy ?? business.returnPolicy,
    faqs: input.businessPatch.faqs ?? business.faqs,
    escalationEmail: input.businessPatch.escalationEmail ?? business.escalationEmail,
    escalationPhone: input.businessPatch.escalationPhone ?? business.escalationPhone,
    agentTone: input.businessPatch.agentTone ?? business.agentTone,
    rawMarkdownUpload: business.rawMarkdownUpload,
  };

  const recompiled = changedFacts.length > 0;
  const markdown = recompiled ? compileBrainMd(nextFacts) : business.compiledBrainMd;
  const chunks = recompiled ? chunkMarkdown(markdown) : [];
  const brainVersion = recompiled ? business.brainVersion + 1 : business.brainVersion;

  const saved = await prisma.$transaction(async (tx) => {
    if (recompiled) {
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
        data: {
          ...(changedFacts.includes("name") ? { name: nextFacts.name } : {}),
          ...(changedFacts.includes("businessType") ? { businessType: nextFacts.businessType } : {}),
          ...(changedFacts.includes("description") ? { description: nextFacts.description } : {}),
          ...(changedFacts.includes("productsServices")
            ? { productsServices: nextFacts.productsServices }
            : {}),
          ...(changedFacts.includes("hours") ? { hours: nextFacts.hours } : {}),
          ...(changedFacts.includes("returnPolicy") ? { returnPolicy: nextFacts.returnPolicy } : {}),
          ...(changedFacts.includes("faqs") ? { faqs: nextFacts.faqs } : {}),
          ...(changedFacts.includes("escalationEmail")
            ? { escalationEmail: nextFacts.escalationEmail }
            : {}),
          ...(changedFacts.includes("escalationPhone")
            ? { escalationPhone: nextFacts.escalationPhone }
            : {}),
          ...(changedFacts.includes("agentTone") ? { agentTone: nextFacts.agentTone } : {}),
          compiledBrainMd: markdown,
          brainVersion,
        },
      });
    }

    return tx.businessVoiceAgentContext.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        businessAddress: input.context.businessAddress,
        weeklyHolidays: JSON.stringify(input.context.weeklyHolidays),
        supportedLanguages: JSON.stringify(input.context.supportedLanguages),
        appointmentPolicy: input.context.appointmentPolicy,
        agentInstructions: input.context.agentInstructions,
        virtualNumber: input.context.virtualNumber,
        agentId: input.context.agentId,
        isActive: input.context.isActive,
      },
      update: {
        businessAddress: input.context.businessAddress,
        weeklyHolidays: JSON.stringify(input.context.weeklyHolidays),
        supportedLanguages: JSON.stringify(input.context.supportedLanguages),
        appointmentPolicy: input.context.appointmentPolicy,
        agentInstructions: input.context.agentInstructions,
        virtualNumber: input.context.virtualNumber,
        agentId: input.context.agentId,
        isActive: input.context.isActive,
      },
    });
  });

  const chunkCount = recompiled
    ? chunks.length
    : await prisma.knowledgeChunk.count({ where: { businessId: business.id } });

  return {
    context: toVoiceAgentContextView(saved),
    brainVersion,
    chunkCount,
    recompiled,
  };
}

/** Owner-facing view: the editable core facts plus the call-script fields. */
export interface VoiceAgentContextResponse extends VoiceAgentContextView {
  businessId: string;
  businessName: string;
  businessType: string;
  businessDescription: string;
  productsServices: string;
  openingHours: string;
  faqs: string;
  returnPolicy: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  brainVersion: number;
  chunkCount: number;
}

export async function buildOwnerContextResponse(
  business: Business,
): Promise<VoiceAgentContextResponse> {
  const row = await loadVoiceAgentContext(business.id);
  const view = row === null
    ? {
        businessId: business.id,
        ...EMPTY_CONTEXT,
        weeklyHolidays: [],
        supportedLanguages: [],
        updatedAt: null,
      }
    : toVoiceAgentContextView(row);
  const chunkCount = await prisma.knowledgeChunk.count({ where: { businessId: business.id } });

  return {
    ...view,
    businessName: business.name,
    businessType: business.businessType,
    businessDescription: business.description,
    productsServices: business.productsServices,
    openingHours: business.hours,
    faqs: business.faqs,
    returnPolicy: business.returnPolicy,
    escalationEmail: business.escalationEmail,
    escalationPhone: business.escalationPhone,
    agentTone: business.agentTone,
    brainVersion: business.brainVersion,
    chunkCount,
  };
}

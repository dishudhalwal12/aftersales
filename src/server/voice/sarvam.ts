/**
 * Sarvam AI voice client.
 *
 * Two honest modes:
 *   live    — SARVAM_API_KEY + SARVAM_CALL_ENDPOINT set; a real outbound call is placed.
 *   dry_run — either is missing: no call is placed, nothing is faked, and the
 *             reason is returned to the caller and shown in the panel.
 *
 * The endpoint is configuration, not an invented constant: Sarvam's outbound-call
 * URL comes from the account that owns the rented number.
 */

import { randomInt } from "node:crypto";
import type { CustomizationVariables } from "./customizations.ts";
import { FACT_LIMITS, VOICE_CONTEXT_LIMITS } from "../../shared/fact-limits.ts";

export interface SarvamStatus {
  configured: boolean;
  virtualNumber: string | null;
  endpointConfigured: boolean;
  reason: string;
}

export function sarvamStatus(): SarvamStatus {
  const apiKey = (process.env.SARVAM_API_KEY ?? "").trim();
  const endpoint = (process.env.SARVAM_CALL_ENDPOINT ?? "").trim();
  const virtualNumber = (process.env.SARVAM_VIRTUAL_NUMBER ?? "").trim();

  if (apiKey.length === 0) {
    return {
      configured: false,
      virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
      endpointConfigured: endpoint.length > 0,
      reason: "SARVAM_API_KEY is not set — the voice panel runs as a dry run and places no call.",
    };
  }
  if (endpoint.length === 0) {
    return {
      configured: false,
      virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
      endpointConfigured: false,
      reason:
        "SARVAM_CALL_ENDPOINT is not set — the outbound-call URL comes from your Sarvam account.",
    };
  }
  return {
    configured: true,
    virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
    endpointConfigured: true,
    reason: "Sarvam credentials present — outbound calls will be placed.",
  };
}

/** 4-digit fallback PIN the caller can read out to resume a session (PRD §1.3). */
export function generateDemoPin(): string {
  return String(randomInt(1000, 10000));
}

export interface OutboundCallInput {
  phone: string;
  sessionId: string;
  businessName: string;
  demoPin: string;
  variables: Record<string, string>;
}

export interface OutboundCallResult {
  mode: "live" | "dry_run";
  ok: boolean;
  interactionId: string | null;
  reason: string;
}

export async function placeOutboundCall(input: OutboundCallInput): Promise<OutboundCallResult> {
  const status = sarvamStatus();
  if (!status.configured) {
    return { mode: "dry_run", ok: true, interactionId: null, reason: status.reason };
  }

  try {
    const response = await fetch((process.env.SARVAM_CALL_ENDPOINT ?? "").trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": (process.env.SARVAM_API_KEY ?? "").trim(),
      },
      body: JSON.stringify({
        phone_number: input.phone,
        agent_id: (process.env.SARVAM_AGENT_ID ?? "").trim() || undefined,
        metadata: {
          session_id: input.sessionId,
          business_name: input.businessName,
          demo_pin: input.demoPin,
          ...input.variables,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        mode: "live",
        ok: false,
        interactionId: null,
        reason: `Sarvam call API returned HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const interactionId =
      typeof body["interaction_id"] === "string"
        ? body["interaction_id"]
        : typeof body["id"] === "string"
          ? body["id"]
          : null;

    return {
      mode: "live",
      ok: true,
      interactionId,
      reason: "Outbound call requested.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "call request failed";
    return { mode: "live", ok: false, interactionId: null, reason: message };
  }
}

export interface VoiceCallContext {
  businessAddress: string;
  weeklyHolidays: string[];
  supportedLanguages: string[];
  appointmentPolicy: string;
  agentInstructions: string;
}

interface CallVariableBusiness {
  id: string;
  name: string;
  businessType: string;
  description: string;
  productsServices: string;
  hours: string;
  faqs: string;
  returnPolicy: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  rawMarkdownUpload: string;
}

/** Joined lists and derived customization sentences have no stored column of their own. */
const LIST_BUDGET = 200;
const CUSTOMIZATION_BUDGET = 3_000;

interface BudgetedValue {
  value: string;
  sourceCharacters: number;
  clipped: boolean;
}

/**
 * Sarvam rejects oversized variables and truncating in the prompt is worse than
 * truncating here, where the cut is visible to the template author and reported
 * to the caller instead of being lost.
 */
function fitBudget(source: string, max: number): BudgetedValue {
  const text = source.trim();
  if (text.length <= max) {
    return { value: text, sourceCharacters: text.length, clipped: false };
  }
  return {
    value: `${text.slice(0, max - 1)}…`,
    sourceCharacters: text.length,
    clipped: true,
  };
}

/** A variable that had to be shortened, so the loss is never silent. */
export interface ClippedVoiceVariable {
  variable: string;
  sentCharacters: number;
  sourceCharacters: number;
}

export interface CallVariablesReport {
  variables: Record<string, string>;
  clipped: ClippedVoiceVariable[];
}

/**
 * The per-call variables a Sarvam agent template receives (PRD §6, Phase 1).
 * Name, plan, hours, FAQs and the uploaded knowledge file come from the business
 * brain; address, holidays, languages, appointment policy and agent instructions
 * come from the BusinessVoiceAgentContext row when one exists.
 *
 * Budgets are the onboarding limits from `shared/fact-limits.ts`, so every value
 * the owner could fill fits — any clipping happens only for data written before
 * those limits existed, and it is reported in `clipped`.
 */
export function buildCallVariablesWithReport(
  business: CallVariableBusiness,
  context?: VoiceCallContext | null,
  customizations?: CustomizationVariables | null,
): CallVariablesReport {
  const baseUrl = (process.env.PUBLIC_WEBHOOK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const clipped: ClippedVoiceVariable[] = [];
  const values: Record<string, string> = { business_id: business.id };

  const put = (variable: string, source: string, max: number): void => {
    const fitted = fitBudget(source, max);
    if (fitted.clipped) {
      clipped.push({
        variable,
        sentCharacters: fitted.value.length,
        sourceCharacters: fitted.sourceCharacters,
      });
    }
    values[variable] = fitted.value;
  };

  put("business_name", business.name, FACT_LIMITS.name);
  put("business_type", business.businessType, FACT_LIMITS.businessType);
  put("business_description", business.description, FACT_LIMITS.description);
  put("business_address", context?.businessAddress ?? "", VOICE_CONTEXT_LIMITS.businessAddress);
  put("products_services", business.productsServices, FACT_LIMITS.productsServices);
  put("opening_hours", business.hours, FACT_LIMITS.hours);
  put("weekly_holidays", (context?.weeklyHolidays ?? []).join(", "), LIST_BUDGET);
  put("supported_languages", (context?.supportedLanguages ?? []).join(", "), LIST_BUDGET);
  put("faqs", business.faqs, FACT_LIMITS.faqs);
  put("appointment_policy", context?.appointmentPolicy ?? "", VOICE_CONTEXT_LIMITS.appointmentPolicy);
  put("return_policy", business.returnPolicy, FACT_LIMITS.returnPolicy);
  put("escalation_email", business.escalationEmail, FACT_LIMITS.escalationEmail);
  put("escalation_phone", business.escalationPhone, FACT_LIMITS.escalationPhone);
  put("agent_tone", business.agentTone, FACT_LIMITS.agentTone);
  put("agent_instructions", context?.agentInstructions ?? "", VOICE_CONTEXT_LIMITS.agentInstructions);
  put("uploaded_knowledge", business.rawMarkdownUpload, FACT_LIMITS.rawMarkdownUpload);
  values["tool_search_url"] = `${baseUrl}/api/voice/sarvam-tool-search`;
  values["request_tool_url"] = `${baseUrl}/api/voice/sarvam-request`;

  if (customizations !== null && customizations !== undefined) {
    for (const [key, value] of Object.entries(customizations)) {
      put(key, value, CUSTOMIZATION_BUDGET);
    }
  }

  return { variables: values, clipped };
}

/** Backwards-compatible shape: the variables only. */
export function buildCallVariables(
  business: CallVariableBusiness,
  context?: VoiceCallContext | null,
  customizations?: CustomizationVariables | null,
): Record<string, string> {
  return buildCallVariablesWithReport(business, context, customizations).variables;
}

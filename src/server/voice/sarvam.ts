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
}

/**
 * Sarvam rejects oversized variables and truncating in the prompt is worse than
 * truncating here, where the cut is visible to the template author.
 */
function clip(value: string, max = 1_500): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The per-call variables a Sarvam agent template receives (PRD §6, Phase 1).
 * Name, plan, hours and FAQs come from the business brain; address, holidays,
 * languages, appointment policy and agent instructions come from the
 * BusinessVoiceAgentContext row when one exists.
 */
export function buildCallVariables(
  business: CallVariableBusiness,
  context?: VoiceCallContext | null,
  customizations?: CustomizationVariables | null,
): Record<string, string> {
  const values: Record<string, string> = {
    business_id: business.id,
    business_name: business.name,
    business_type: business.businessType,
    business_description: clip(business.description),
    business_address: clip(context?.businessAddress ?? "", 300),
    products_services: clip(business.productsServices),
    opening_hours: clip(business.hours, 500),
    weekly_holidays: clip((context?.weeklyHolidays ?? []).join(", "), 200),
    supported_languages: clip((context?.supportedLanguages ?? []).join(", "), 200),
    faqs: clip(business.faqs, 2_500),
    appointment_policy: clip(context?.appointmentPolicy ?? "", 1_000),
    return_policy: clip(business.returnPolicy, 1_500),
    escalation_email: clip(business.escalationEmail, 160),
    escalation_phone: clip(business.escalationPhone, 40),
    agent_tone: business.agentTone,
    agent_instructions: clip(context?.agentInstructions ?? "", 1_500),
    tool_search_url: `${(process.env.PUBLIC_WEBHOOK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/voice/sarvam-tool-search`,
    request_tool_url: `${(process.env.PUBLIC_WEBHOOK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/voice/sarvam-request`,
  };

  if (customizations !== null && customizations !== undefined) {
    for (const [key, value] of Object.entries(customizations)) {
      values[key] = clip(value, 3_000);
    }
  }
  return values;
}

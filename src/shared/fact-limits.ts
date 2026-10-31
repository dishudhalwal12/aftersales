/**
 * The one place onboarding budgets live.
 *
 * Three surfaces have to agree or details vanish between them: the wizard's
 * `POST /api/businesses` (what an owner may type), the dashboard's
 * `PUT /api/businesses/:id/voice-agent/context` (what may be patched later), and
 * `buildCallVariables` (what Sarvam actually receives as JSON variables). They
 * all read these numbers, so a field the owner fills is a field the voice agent
 * gets — no silent truncation, and no value the API accepts that the payload
 * silently drops.
 */
import type { BusinessFacts } from "./domain.ts";

/** Maximum characters the onboarding API accepts for each brain fact. */
export const FACT_LIMITS: Readonly<Record<keyof BusinessFacts, number>> = {
  name: 120,
  businessType: 80,
  description: 4_000,
  productsServices: 8_000,
  hours: 1_000,
  returnPolicy: 4_000,
  faqs: 8_000,
  escalationEmail: 200,
  escalationPhone: 40,
  agentTone: 200,
  rawMarkdownUpload: 20_000,
};

/** Maximum characters the call-script fields accept; also their payload budget. */
export const VOICE_CONTEXT_LIMITS = {
  businessAddress: 300,
  appointmentPolicy: 1_000,
  agentInstructions: 2_000,
} as const;

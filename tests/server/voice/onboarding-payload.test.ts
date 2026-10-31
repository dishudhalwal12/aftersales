/**
 * The onboarding contract, end to end: everything the wizard collects must be in
 * the JSON payload Sarvam receives. These tests drive the real builders, so a
 * dropped field or a silent clip fails here instead of on a live call.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Business, BusinessVoiceAgentContext } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://demo:demo@127.0.0.1:5432/demo";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { buildCallVariables, buildCallVariablesWithReport } = await import(
  "../../../src/server/voice/sarvam.ts"
);
const { FACT_LIMITS, VOICE_CONTEXT_LIMITS } = await import("../../../src/shared/fact-limits.ts");
const { parseVoiceContextBody } = await import("../../../src/server/voice/context.ts");

/** One filled wizard per field, each value padded to the maximum the API accepts. */
function filledFacts(): Record<keyof typeof FACT_LIMITS, string> {
  const pad = (label: string, max: number) => {
    const marker = `${label.toUpperCase()} `;
    return `${marker}${"x".repeat(Math.max(0, max - marker.length))}`.slice(0, max);
  };
  return {
    name: pad("name", FACT_LIMITS.name),
    businessType: pad("businessType", FACT_LIMITS.businessType),
    description: pad("description", FACT_LIMITS.description),
    productsServices: pad("productsServices", FACT_LIMITS.productsServices),
    hours: pad("hours", FACT_LIMITS.hours),
    returnPolicy: pad("returnPolicy", FACT_LIMITS.returnPolicy),
    faqs: pad("faqs", FACT_LIMITS.faqs),
    escalationEmail: "founder@cloudpulse.in",
    escalationPhone: "+919876543210",
    agentTone: pad("agentTone", FACT_LIMITS.agentTone),
    rawMarkdownUpload: pad("upload", FACT_LIMITS.rawMarkdownUpload),
  };
}

function business(facts: Record<keyof typeof FACT_LIMITS, string>): Business {
  return {
    id: "biz_filled_01",
    ownerId: "user_demo",
    ...facts,
    autoSendEnabled: true,
    compiledBrainMd: "# brain",
    brainVersion: 1,
    createdAt: new Date("2026-10-31T00:00:00.000Z"),
    updatedAt: new Date("2026-10-31T00:00:00.000Z"),
  };
}

function contextRow(): BusinessVoiceAgentContext {
  return {
    businessId: "biz_filled_01",
    businessAddress: "a".repeat(VOICE_CONTEXT_LIMITS.businessAddress),
    weeklyHolidays: JSON.stringify(["Sunday"]),
    supportedLanguages: JSON.stringify(["Hindi", "English"]),
    appointmentPolicy: "p".repeat(VOICE_CONTEXT_LIMITS.appointmentPolicy),
    agentInstructions: "i".repeat(VOICE_CONTEXT_LIMITS.agentInstructions),
    virtualNumber: null,
    agentId: null,
    isActive: true,
    createdAt: new Date("2026-10-31T00:00:00.000Z"),
    updatedAt: new Date("2026-10-31T00:00:00.000Z"),
  };
}

/** The builder takes the composed context (arrays), not the stored JSON row. */
function callContext(row = contextRow()) {
  return {
    businessAddress: row.businessAddress,
    weeklyHolidays: JSON.parse(row.weeklyHolidays) as string[],
    supportedLanguages: JSON.parse(row.supportedLanguages) as string[],
    appointmentPolicy: row.appointmentPolicy,
    agentInstructions: row.agentInstructions,
  };
}

const VARIABLE_FOR_FACT = {
  name: "business_name",
  businessType: "business_type",
  description: "business_description",
  productsServices: "products_services",
  hours: "opening_hours",
  returnPolicy: "return_policy",
  faqs: "faqs",
  escalationEmail: "escalation_email",
  escalationPhone: "escalation_phone",
  agentTone: "agent_tone",
  rawMarkdownUpload: "uploaded_knowledge",
} as const satisfies Record<keyof typeof FACT_LIMITS, string>;

describe("onboarding facts in the Sarvam payload", () => {
  it("sends every wizard field verbatim, at the maximum the onboarding API accepts", () => {
    const facts = filledFacts();
    const variables = buildCallVariables(business(facts), callContext());

    for (const [field, variable] of Object.entries(VARIABLE_FOR_FACT)) {
      const source = facts[field as keyof typeof facts];
      assert.equal(
        variables[variable],
        source,
        `${field} must reach Sarvam as "${variable}" without being clipped`,
      );
    }
  });

  it("sends the uploaded knowledge file as its own variable", () => {
    const facts = filledFacts();
    const variables = buildCallVariables(business(facts), callContext());
    assert.equal(variables["uploaded_knowledge"], facts.rawMarkdownUpload);
  });

  it("reports nothing clipped when every value fits its budget", () => {
    const report = buildCallVariablesWithReport(business(filledFacts()), callContext());
    assert.deepEqual(report.clipped, []);
  });

  it("names the variable it clips instead of losing the tail silently", () => {
    // Values can exceed the budget in rows written before the limits were shared
    // (or by a direct DB edit), so clipping stays visible rather than silent.
    const facts = { ...filledFacts(), productsServices: "y".repeat(FACT_LIMITS.productsServices + 25) };
    const report = buildCallVariablesWithReport(business(facts), callContext());

    assert.equal(report.clipped.length, 1);
    const [clip] = report.clipped;
    assert.ok(clip);
    assert.equal(clip.variable, "products_services");
    assert.equal(clip.sourceCharacters, facts.productsServices.length);
    assert.equal(clip.sentCharacters, FACT_LIMITS.productsServices);
    const sent = report.variables["products_services"] ?? "";
    assert.equal(sent.length, FACT_LIMITS.productsServices);
    assert.equal(sent.endsWith("…"), true);
  });

  it("accepts exactly the limits it sends, so the dashboard cannot save something Sarvam never sees", () => {
    const facts = filledFacts();
    const parsed = parseVoiceContextBody({ ...facts, rawMarkdownUpload: undefined });
    assert.equal(parsed.businessPatch.description, facts.description);
    assert.equal(parsed.businessPatch.productsServices, facts.productsServices);
    assert.equal(parsed.businessPatch.faqs, facts.faqs);
  });
});

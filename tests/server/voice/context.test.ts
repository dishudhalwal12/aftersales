import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Business, BusinessVoiceAgentContext } from "@prisma/client";
import { HttpError } from "../../../src/server/auth/http-error.ts";

// context.ts constructs the Prisma client at import time; the tests only use the
// pure functions, but the client still validates that a datasource URL exists.
process.env.DATABASE_URL ??= "postgresql://demo:demo@127.0.0.1:5432/demo";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const {
  WEEKDAYS,
  authorizeVoiceContext,
  composeVoiceContext,
  contextFromRow,
  normalizePhoneNumber,
  parseTrustedIdentifiers,
  parseVoiceContextBody,
  readVoiceContextSecret,
  resolveVoiceMapping,
  verifyVoiceContextSecret,
  voiceCallContext,
} = await import("../../../src/server/voice/context.ts");

function status(code: number) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof HttpError, `expected HttpError, got ${String(error)}`);
    assert.equal(error.status, code);
    return true;
  };
}

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz_cloudpulse_01",
    ownerId: "user_demo",
    name: "CloudPulse CRM",
    businessType: "SaaS",
    description: "Inventory and GST billing software for retail shops.",
    productsServices: "Pro Plan: ₹1,499 per month, five users, WhatsApp invoicing.",
    hours: "Monday to Saturday, 9:00 AM to 7:00 PM IST.",
    returnPolicy: "Full refund within 7 days if fewer than 10 invoices were generated.",
    faqs: "Q: Can I export GSTR-1? A: Reports > GST > Export JSON.",
    escalationEmail: "founder@cloudpulse.in",
    escalationPhone: "+919876543210",
    agentTone: "Clear and professional",
    autoSendEnabled: true,
    compiledBrainMd: "# brain",
    brainVersion: 4,
    rawMarkdownUpload: "",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function contextRow(
  overrides: Partial<BusinessVoiceAgentContext> = {},
): BusinessVoiceAgentContext {
  return {
    businessId: "biz_cloudpulse_01",
    businessAddress: "3rd Floor, Orbit Plaza, MG Road, Bengaluru",
    weeklyHolidays: JSON.stringify(["Sunday"]),
    supportedLanguages: JSON.stringify(["Hindi", "English"]),
    appointmentPolicy: "Calls are scheduled by the owner.",
    agentInstructions: "Quote only the plans in the brain.",
    virtualNumber: null,
    agentId: null,
    isActive: true,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("phone and agent identifier validation", () => {
  it("normalises spaces, punctuation and a missing plus", () => {
    assert.equal(normalizePhoneNumber(" +91 98123-45678 "), "+919812345678");
    assert.equal(normalizePhoneNumber("+91 (98123) 45678"), "+919812345678");
    assert.equal(normalizePhoneNumber("918047123456"), "+918047123456");
  });

  it("refuses numbers that cannot be dialled as E.164", () => {
    assert.equal(normalizePhoneNumber("12345"), null);
    assert.equal(normalizePhoneNumber("09812345678"), null);
    assert.equal(normalizePhoneNumber("+91 9812 34A78"), null);
    assert.equal(normalizePhoneNumber(""), null);
  });

  it("reads only trusted identifiers from a Sarvam on-start body", () => {
    assert.deepEqual(parseTrustedIdentifiers({ agentId: "agent_7", virtualNumber: "+91 80471 23456" }), {
      agentId: "agent_7",
      virtualNumber: "+918047123456",
    });
    assert.deepEqual(parseTrustedIdentifiers({ businessId: "biz_other" }), {
      agentId: null,
      virtualNumber: null,
    });
    assert.throws(() => parseTrustedIdentifiers({ agentId: "bad id!" }), status(400));
    assert.throws(() => parseTrustedIdentifiers({ virtualNumber: "12" }), status(400));
  });
});

describe("parseVoiceContextBody", () => {
  it("blank is the default for every call-script field", () => {
    const parsed = parseVoiceContextBody({});
    assert.deepEqual(parsed.context, {
      businessAddress: "",
      weeklyHolidays: [],
      supportedLanguages: [],
      appointmentPolicy: "",
      agentInstructions: "",
      virtualNumber: null,
      agentId: null,
      isActive: true,
    });
    assert.deepEqual(parsed.businessPatch, {});
  });

  it("canonicalises weekdays, dedupes languages and strips control characters", () => {
    const parsed = parseVoiceContextBody({
      businessAddress: " 12 Vidhyadhar Nagar\u0000, Jaipur ",
      weeklyHolidays: ["monday", "SUNDAY", "Monday"],
      supportedLanguages: "Hindi, English, hindi",
      appointmentPolicy: "Free reschedule up to 4 hours before.",
      agentInstructions: "Never diagnose.",
      isActive: false,
    });

    assert.equal(parsed.context.businessAddress, "12 Vidhyadhar Nagar, Jaipur");
    assert.deepEqual(parsed.context.weeklyHolidays, ["Monday", "Sunday"]);
    assert.deepEqual(parsed.context.supportedLanguages, ["Hindi", "English"]);
    assert.equal(parsed.context.isActive, false);
  });

  it("accepts every weekday and rejects a day that is not one", () => {
    for (const day of WEEKDAYS) {
      assert.deepEqual(parseVoiceContextBody({ weeklyHolidays: [day] }).context.weeklyHolidays, [day]);
    }
    assert.throws(() => parseVoiceContextBody({ weeklyHolidays: ["Funday"] }), status(400));
  });

  it("rejects invalid input instead of storing it", () => {
    assert.throws(() => parseVoiceContextBody({ virtualNumber: "080-4712" }), status(400));
    assert.throws(() => parseVoiceContextBody({ agentId: "x".repeat(81) }), status(400));
    assert.throws(() => parseVoiceContextBody({ isActive: "yes" }), status(400));
    assert.throws(() => parseVoiceContextBody({ supportedLanguages: [1, 2] }), status(400));
    assert.throws(() => parseVoiceContextBody({ businessAddress: "x".repeat(301) }), status(400));
    assert.throws(
      () => parseVoiceContextBody({ agentInstructions: "x".repeat(2_001) }),
      status(400),
    );
    assert.throws(() => parseVoiceContextBody({ name: "   " }), status(400));
    assert.throws(() => parseVoiceContextBody({ escalationEmail: "not-an-email" }), status(400));
    assert.throws(() => parseVoiceContextBody({ escalationPhone: "12345" }), status(400));
    assert.throws(() => parseVoiceContextBody({ hours: 9 }), status(400));
  });

  it("patches only the core facts that are present", () => {
    const parsed = parseVoiceContextBody({
      name: "CloudPulse CRM",
      description: "New description.",
      weeklyHolidays: ["Sunday"],
    });

    assert.deepEqual(parsed.businessPatch, {
      name: "CloudPulse CRM",
      description: "New description.",
    });
    assert.equal("hours" in parsed.businessPatch, false);
  });
});

describe("per-business composition", () => {
  const cloudpulse = business();
  const clinic = business({
    id: "biz_jaipursmile_02",
    name: "Jaipur Smile Studio",
    businessType: "Healthcare Clinic",
    description: "A dental clinic in Jaipur.",
    productsServices: "Root canal treatment: ₹4,500 per tooth.",
    hours: "Tuesday to Sunday, 10:00 AM to 8:00 PM IST.",
    faqs: "Q: Does a root canal hurt? A: The tooth is numbed.",
    escalationEmail: "frontdesk@jaipursmile.in",
    escalationPhone: "+919812345678",
  });
  const clinicRow = contextRow({
    businessId: clinic.id,
    businessAddress: "12 Vidhyadhar Nagar, Jaipur",
    weeklyHolidays: JSON.stringify(["Monday"]),
    supportedLanguages: JSON.stringify(["Hindi", "English"]),
    appointmentPolicy: "Cancel inside 4 hours and pay ₹300.",
    agentInstructions: "Never diagnose; offer a same-day slot for pain.",
  });

  it("answers each business with its own facts and never the other's", () => {
    const variablesA = voiceCallContext(cloudpulse, contextRow());
    const variablesB = voiceCallContext(clinic, clinicRow);

    assert.equal(variablesA["business_name"], "CloudPulse CRM");
    assert.equal(variablesB["business_name"], "Jaipur Smile Studio");
    assert.equal(variablesA["business_address"], contextRow().businessAddress);
    assert.equal(variablesB["business_address"], "12 Vidhyadhar Nagar, Jaipur");
    assert.equal(variablesA["weekly_holidays"], "Sunday");
    assert.equal(variablesB["weekly_holidays"], "Monday");
    assert.equal(variablesA["appointment_policy"], "Calls are scheduled by the owner.");
    assert.equal(variablesB["agent_instructions"], "Never diagnose; offer a same-day slot for pain.");

    assert.equal(JSON.stringify(variablesA).includes("Jaipur"), false);
    assert.equal((variablesA["faqs"] ?? "").includes("root canal"), false);
    assert.equal((variablesB["products_services"] ?? "").includes("Pro Plan"), false);
  });

  it("falls back to the brain facts when no context row exists", () => {
    const variables = voiceCallContext(clinic, null);
    assert.equal(variables["business_name"], "Jaipur Smile Studio");
    assert.equal(variables["business_address"], "");
    assert.equal(variables["weekly_holidays"], "");
    assert.equal(variables["appointment_policy"], "");
    assert.equal(variables["agent_instructions"], "");
    assert.equal((variables["tool_search_url"] ?? "").endsWith("/api/voice/sarvam-tool-search"), true);
    for (const value of Object.values(variables)) {
      assert.equal(typeof value, "string");
    }
  });

  it("treats a corrupted stored list as empty rather than throwing", () => {
    assert.deepEqual(
      contextFromRow(contextRow({ weeklyHolidays: "not-json", supportedLanguages: '{"a":1}' })),
      {
        businessAddress: "3rd Floor, Orbit Plaza, MG Road, Bengaluru",
        weeklyHolidays: [],
        supportedLanguages: [],
        appointmentPolicy: "Calls are scheduled by the owner.",
        agentInstructions: "Quote only the plans in the brain.",
        virtualNumber: null,
        agentId: null,
        isActive: true,
      },
    );
  });

  it("exposes the composed view without leaking another tenant's row", () => {
    const composed = composeVoiceContext(clinic, clinicRow);
    assert.equal(composed.businessId, clinic.id);
    assert.equal(composed.businessName, "Jaipur Smile Studio");
    assert.deepEqual(composed.weeklyHolidays, ["Monday"]);
  });
});

describe("trusted identifier resolution", () => {
  const candidate = (businessId: string, overrides: Record<string, unknown> = {}) => ({
    businessId,
    agentId: "agent_shared",
    virtualNumber: "+918047123456",
    isActive: true,
    ...overrides,
  });

  it("resolves by agent id alone", () => {
    const match = resolveVoiceMapping({
      agentId: "agent_shared",
      virtualNumber: null,
      agentMatches: [candidate("biz_a")],
      numberMatches: [],
    });
    assert.equal(match.businessId, "biz_a");
  });

  it("resolves by virtual number alone", () => {
    const match = resolveVoiceMapping({
      agentId: null,
      virtualNumber: "+918047123456",
      agentMatches: [],
      numberMatches: [candidate("biz_b")],
    });
    assert.equal(match.businessId, "biz_b");
  });

  it("resolves when both identifiers agree on one business", () => {
    const match = resolveVoiceMapping({
      agentId: "agent_shared",
      virtualNumber: "+918047123456",
      agentMatches: [candidate("biz_a")],
      numberMatches: [candidate("biz_a")],
    });
    assert.equal(match.businessId, "biz_a");
  });

  it("refuses when the two identifiers point at different businesses", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: "agent_shared",
          virtualNumber: "+918047123456",
          agentMatches: [candidate("biz_a")],
          numberMatches: [candidate("biz_b")],
        }),
      status(409),
    );
  });

  it("refuses one identifier when part of the pair is unmapped", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: "agent_shared",
          virtualNumber: "+918047123456",
          agentMatches: [candidate("biz_a")],
          numberMatches: [],
        }),
      status(404),
    );
  });

  it("treats a shared number across two businesses as ambiguous", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: null,
          virtualNumber: "+918047123456",
          agentMatches: [],
          numberMatches: [candidate("biz_a"), candidate("biz_b")],
        }),
      status(409),
    );
  });

  it("reports an unmapped identifier as missing", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: "agent_unknown",
          virtualNumber: null,
          agentMatches: [],
          numberMatches: [],
        }),
      status(404),
    );
  });

  it("refuses an inactive mapping instead of answering with stale facts", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: null,
          virtualNumber: "+918047123456",
          agentMatches: [],
          numberMatches: [candidate("biz_a", { isActive: false })],
        }),
      status(409),
    );
  });

  it("requires at least one trusted identifier", () => {
    assert.throws(
      () =>
        resolveVoiceMapping({
          agentId: null,
          virtualNumber: null,
          agentMatches: [],
          numberMatches: [],
        }),
      status(400),
    );
  });

  it("deduplicates the same business reported twice", () => {
    const match = resolveVoiceMapping({
      agentId: "agent_shared",
      virtualNumber: null,
      agentMatches: [candidate("biz_a"), candidate("biz_a")],
      numberMatches: [],
    });
    assert.equal(match.businessId, "biz_a");
  });
});

describe("shared secret", () => {
  it("prefers SARVAM_CONTEXT_TOKEN and falls back to SARVAM_WEBHOOK_TOKEN", () => {
    assert.equal(
      readVoiceContextSecret({
        SARVAM_CONTEXT_TOKEN: "context-secret",
        SARVAM_WEBHOOK_TOKEN: "webhook-secret",
      }),
      "context-secret",
    );
    assert.equal(readVoiceContextSecret({ SARVAM_WEBHOOK_TOKEN: "webhook-secret" }), "webhook-secret");
    assert.equal(readVoiceContextSecret({}), "");
  });

  it("accepts any documented header only with the exact secret", () => {
    const env = { SARVAM_CONTEXT_TOKEN: "s3cret" };

    for (const header of ["x-saram-token", "x-sarvam-token", "x-sarvam-context-token"]) {
      const headers = new Headers({ [header]: "s3cret" });
      assert.deepEqual(authorizeVoiceContext(headers, env), {
        configured: true,
        authorized: true,
        mode: "shared-secret",
      });
    }

    const bearer = new Headers({ authorization: "Bearer s3cret" });
    assert.equal(authorizeVoiceContext(bearer, env).authorized, true);

    assert.equal(authorizeVoiceContext(new Headers({ "x-saram-token": "wrong" }), env).authorized, false);
    assert.equal(authorizeVoiceContext(new Headers(), env).authorized, false);
  });

  it("reports an unconfigured secret instead of pretending it is secured", () => {
    assert.deepEqual(authorizeVoiceContext(new Headers(), {}), {
      configured: false,
      authorized: true,
      mode: "unconfigured",
    });
  });

  it("never accepts an empty presented value for a configured secret", () => {
    assert.equal(verifyVoiceContextSecret("", "s3cret"), false);
    assert.equal(verifyVoiceContextSecret("s3cret", ""), false);
    assert.equal(verifyVoiceContextSecret("s3cret", "s3cret"), true);
  });

  it("never puts the secret into call variables", () => {
    const secret = "context-secret-value";
    const prior = process.env.SARVAM_CONTEXT_TOKEN;
    process.env.SARVAM_CONTEXT_TOKEN = secret;
    try {
      const variables = voiceCallContext(business(), contextRow());
      assert.equal(JSON.stringify(variables).includes(secret), false);
      for (const value of Object.values(variables)) assert.notEqual(value, secret);
    } finally {
      if (prior === undefined) delete process.env.SARVAM_CONTEXT_TOKEN;
      else process.env.SARVAM_CONTEXT_TOKEN = prior;
    }
  });
});

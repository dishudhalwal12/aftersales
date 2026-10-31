#!/usr/bin/env node
/**
 * Environment check — tells a human which keys are set and which are missing.
 *
 * It never prints a value, so its output is safe to screenshot or paste into a chat.
 * Grouped by feature, because "OPENROUTER_API_KEY is empty" only means something
 * when you also know which part of the app goes quiet without it.
 *
 *   npm run env:check
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");

/** Warnings and errors collected for the summary at the end. */
const problems = [];
const notes = [];

/**
 * Parse `.env` the way Node's --env-file does closely enough for a check: skip blank
 * lines and comments, strip one layer of surrounding quotes.
 */
function readEnvFile(path) {
  const values = new Map();
  if (!existsSync(path)) return values;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

const fileValues = readEnvFile(ENV_PATH);
/** The file wins over the shell for this check: that is what the app will read. */
const value = (key) => (fileValues.get(key) ?? process.env[key] ?? "").trim();

function line(key, hint, { required = false, note = "" } = {}) {
  const present = value(key).length > 0;
  const mark = present ? "✓" : required ? "✗" : "·";
  const state = present ? "set" : required ? "MISSING" : "empty";
  const suffix = present ? (note.length > 0 ? ` (${note})` : "") : ` — ${hint}`;
  console.log(`  ${mark} ${key.padEnd(34)} ${state}${suffix}`);
  if (!present && required) problems.push(key);
}

function section(title) {
  console.log(`\n${title}`);
}

function checkShape(key, ok, message) {
  if (value(key).length === 0) return;
  if (!ok) problems.push(`${key}: ${message}`);
}

console.log("AfterSales AI — environment check");
console.log(`File: ${ENV_PATH}`);
if (!existsSync(ENV_PATH)) {
  console.log(
    "      NOT FOUND. Create a file named .env next to package.json (see docs/ENV-SETUP.md).",
  );
} else {
  console.log(`Keys found in the file: ${fileValues.size}`);
}

section("1. Required — the app cannot start without these");
line("DATABASE_URL", "the Postgres connection string (prisma/schema.prisma reads it)", { required: true });
line("DIRECT_URL", "the same database, used for schema pushes", { required: true });
line("AUTH_SECRET", "signs the login cookie, at least 16 characters", { required: true });

const authSecret = value("AUTH_SECRET");
if (authSecret.length > 0 && authSecret.length < 16) {
  problems.push("AUTH_SECRET must be at least 16 characters");
}

section("2. App address (login redirects use it)");
line("AUTH_BASE_URL", "leave empty locally; set it on a non-Vercel deployment");
line("NEXTAUTH_URL", "http://localhost:3000 for local development");

section("3. AI triage");
line("LLM_PROVIDER", "openrouter or heuristic");
line("OPENROUTER_API_KEY", "without it the app answers with the labelled offline classifier");
line("LLM_MODEL_ID", "the model id used when the key is set", { note: value("LLM_MODEL_ID") });
if (value("LLM_PROVIDER").toLowerCase() === "openrouter" && value("OPENROUTER_API_KEY").length === 0) {
  notes.push("LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is empty — every triage call will fail as R7.");
}

section("4. Google sign-in (Supabase OAuth broker)");
line("SUPABASE_URL", "Project Settings → API → Project URL");
line("SUPABASE_ANON_KEY", "Project Settings → API → anon public key");
if (value("SUPABASE_URL").length > 0 && !/^https?:\/\/[^/\s]+$/.test(value("SUPABASE_URL"))) {
  problems.push("SUPABASE_URL must look like https://<ref>.supabase.co (no path)");
}

section("5. Inbound webhooks and token encryption");
line("CHANNEL_WEBHOOK_SECRET", "shared secret a channel provider sends as x-channel-token");
line("INTEGRATION_ENCRYPTION_KEY", "AES key for provider tokens: 32 bytes, base64 or 64 hex", {
  note: "valid length",
});
line("INTEGRATION_STATE_SECRET", "signs OAuth state; falls back to AUTH_SECRET");
line("CRON_SECRET", "bearer secret for GET /api/social/email/poll");

const encryptionKey = value("INTEGRATION_ENCRYPTION_KEY");
if (encryptionKey.length > 0) {
  const bytes = /^[0-9a-fA-F]{64}$/.test(encryptionKey)
    ? 32
    : Buffer.from(encryptionKey, "base64").length;
  if (bytes !== 32) {
    problems.push(
      `INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (it decodes to ${bytes}); regenerate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
}

section("6. Gmail (real connect / send / receive)");
line("EMAIL_PROVIDER", "gmail");
line("EMAIL_GMAIL_CLIENT_ID", "Google Cloud → Credentials → OAuth client id");
line("EMAIL_GMAIL_CLIENT_SECRET", "Google Cloud → Credentials → OAuth client secret");
line("INTEGRATIONS_BASE_URL", "public origin used to build the OAuth redirect URI");

section("7. Meta — Facebook Page and Instagram DM");
line("META_APP_ID", "Meta for Developers → your app → App ID");
line("META_APP_SECRET", "Meta for Developers → your app → App secret");
line("META_WEBHOOK_VERIFY_TOKEN", "the token you typed into Meta's webhook screen");
line("META_GRAPH_VERSION", "optional, defaults to v26.0");

section("8. WhatsApp via the local Baileys service");
line("BAILEYS_SERVICE_URL", "e.g. http://localhost:3001 while the bridge runs");
line("BAILEYS_SERVICE_SECRET", "must match the bridge's secret");
line("BAILEYS_TIMEOUT_MS", "optional, defaults to 15000");

section("9. Sarvam voice");
line("SARVAM_API_KEY", "without it the voice panel is an explicit dry run");
line("SARVAM_CALL_ENDPOINT", "the outbound-call URL from your Sarvam account");
line("SARVAM_VIRTUAL_NUMBER", "the rented number shown in the dashboard");
line("SARVAM_AGENT_ID", "the agent those calls are placed against");
line("SARVAM_WEBHOOK_TOKEN", "the x-sarvam-token the platform sends back");
line("PUBLIC_WEBHOOK_BASE_URL", "public origin the voice agent calls back to");

section("10. Demo door");
line("JUDGE_DEMO_LOGIN", 'empty means enabled; set to "off" to close it');

console.log("");
if (problems.length > 0) {
  console.log("Problems to fix:");
  for (const problem of problems) console.log(`  ✗ ${problem}`);
}
if (notes.length > 0) {
  console.log("Worth knowing:");
  for (const note of notes) console.log(`  · ${note}`);
}
if (problems.length === 0) {
  console.log("Required keys present. Start the app with: npm run dev");
  const missing = ["OPENROUTER_API_KEY", "SUPABASE_URL", "EMAIL_GMAIL_CLIENT_ID", "META_APP_ID", "SARVAM_API_KEY", "BAILEYS_SERVICE_URL"]
    .filter((key) => value(key).length === 0);
  if (missing.length > 0) {
    console.log(`Empty optional features (they say so on screen instead of pretending): ${missing.join(", ")}`);
  }
  process.exit(0);
}
process.exit(1);

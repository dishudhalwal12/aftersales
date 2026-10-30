import { NextResponse } from "next/server";

import { isBaileysConfigured } from "@/lib/baileys";
import { prisma } from "@/lib/db";
import { readEmailProviderSettings } from "@/lib/email";
import { isIntegrationEncryptionConfigured, isOAuthStateSigningConfigured } from "@/lib/integration-crypto";
import { isMetaConfigured } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "up" | "down" = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch (error) {
    console.error("[health] database check failed", error);
  }

  const checks = {
    database,
    llmConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    sarvamConfigured: Boolean(process.env.SARVAM_API_KEY?.trim()),
    googleOAuthConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    ),
    voiceWebhookConfigured: Boolean(process.env.PUBLIC_WEBHOOK_BASE_URL?.trim()),
    whatsappServiceConfigured: isBaileysConfigured(),
    emailIntegrationConfigured: readEmailProviderSettings().configured,
    metaIntegrationConfigured: isMetaConfigured(),
    integrationEncryptionConfigured: isIntegrationEncryptionConfigured(),
    oauthStateConfigured: isOAuthStateSigningConfigured(),
    emailPollingScheduledJobConfigured: Boolean(process.env.CRON_SECRET?.trim()),
  };

  return NextResponse.json(
    {
      status: database === "up" ? "ok" : "degraded",
      service: "aftersales-ai",
      phase: 1,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    },
    { status: database === "up" ? 200 : 503 }
  );
}

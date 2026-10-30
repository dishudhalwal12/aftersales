import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

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

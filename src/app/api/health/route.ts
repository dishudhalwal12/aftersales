import { NextResponse } from "next/server";
import {
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
} from "../../../server/integrations/crypto.ts";
import { isEmailProviderSupported, readEmailProviderSettings } from "../../../server/integrations/email.ts";
import { isBaileysConfigured, probeBaileysService } from "../../../server/integrations/baileys.ts";
import { isLayaConfigured } from "../../../server/integrations/laya.ts";
import { isMetaConfigured } from "../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Readiness probe. Never touches the database so a dead datastore is
 * reported as a dependency failure rather than a crashed process.
 *
 * `?deep=1` additionally asks the WhatsApp bridge on its host whether it is
 * awake. That is a network call to a machine that may be asleep, so it stays
 * behind an explicit flag: a readiness probe must answer fast and must not
 * depend on a laptop.
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") !== null;

  return NextResponse.json({
    status: "ok",
    service: "aftersales-ai",
    team: "Team 41",
    problemStatement: "PS 2.5 AI Agent for Automated Customer Support and Ticket Triage",
    integrations: {
      encryptionConfigured: isIntegrationEncryptionConfigured(),
      oauthStateConfigured: isOAuthStateSigningConfigured(),
      emailProviderConfigured:
        isEmailProviderSupported(readEmailProviderSettings().provider) &&
        readEmailProviderSettings().configured,
      emailPollingScheduled: Boolean(process.env.CRON_SECRET?.trim()),
      metaConfigured: isMetaConfigured(),
      layaConfigured: isLayaConfigured(),
      baileysConfigured: isBaileysConfigured(),
    },
    ...(deep ? { baileys: await probeBaileysService() } : {}),
    time: new Date().toISOString(),
  });
}

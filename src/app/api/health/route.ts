import { NextResponse } from "next/server";
import {
  isIntegrationEncryptionConfigured,
  isOAuthStateSigningConfigured,
} from "../../../server/integrations/crypto.ts";
import { isEmailProviderSupported, readEmailProviderSettings } from "../../../server/integrations/email.ts";
import { isMetaConfigured } from "../../../server/integrations/meta.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Readiness probe. Never touches the database so a dead datastore is
 * reported as a dependency failure rather than a crashed process.
 */
export function GET() {
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
    },
    time: new Date().toISOString(),
  });
}

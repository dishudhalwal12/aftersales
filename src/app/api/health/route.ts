import { NextResponse } from "next/server";

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
    time: new Date().toISOString(),
  });
}

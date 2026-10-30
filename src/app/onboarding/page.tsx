import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db.ts";
import { getCurrentUser } from "../../lib/auth.ts";
import { PRESETS } from "../../lib/seed-facts.ts";
import { Logo } from "../../components/ui/Logo.tsx";
import { OnboardingWizard } from "../../components/onboarding/OnboardingWizard.tsx";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const existing = await prisma.business.count({ where: { ownerId: user.id } });

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header className="nav">
        <div className="wrap nav-inner">
          <Link href="/" aria-label="AfterSales AI home">
            <Logo />
          </Link>
          <div className="nav-links">
            <span className="tiny muted">{user.email}</span>
            {existing > 0 && (
              <Link href="/dashboard" className="btn btn-sm">
                Back to dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="wrap" style={{ padding: "34px 24px 60px" }}>
        <div style={{ marginBottom: 22, maxWidth: 720 }}>
          <p className="eyebrow">Onboarding</p>
          <h1 style={{ fontSize: 30, marginTop: 6 }}>Install your business into the agent</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Four short steps. What you type here becomes the only facts the agent is allowed to answer
            with — anything outside it escalates instead of being guessed.
          </p>
        </div>

        <OnboardingWizard
          presets={PRESETS.map((preset) => ({ label: preset.label, facts: preset.business.facts }))}
        />
      </main>
    </div>
  );
}

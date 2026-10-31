import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../server/db.ts";
import { getCurrentUser } from "../../server/auth/session.ts";
import { PRESETS } from "../../data/seed-facts.ts";
import { Logo } from "../../components/ui/Logo.tsx";
import { OnboardingWizard } from "../../components/onboarding/OnboardingWizard.tsx";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const existing = await prisma.business.count({ where: { ownerId: user.id } });

  return (
    <div>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link href="/" className="topbar-brand" aria-label="AfterSales AI home">
            <Logo />
          </Link>

          <div className="topbar-actions">
            <span className="tiny muted">{user.email}</span>
            {existing > 0 && (
              <Link href="/dashboard" className="btn btn-sm">
                Back to dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="wrap">
        <section className="page-head">
          <div>
            <p className="eyebrow">Onboarding · one compiled brain</p>
            <h1 className="page-title">Install your business into the agent</h1>
            <p className="page-lede">
              Four short steps. What you type here becomes the only facts the agent is allowed to
              answer with — anything outside it escalates instead of being guessed.
            </p>
          </div>

          <div className="page-meta">
            <div>
              <b>4</b>
              <span>steps</span>
            </div>
            <div>
              <b>1</b>
              <span>compile</span>
            </div>
            <div>
              <b>0</b>
              <span>guesses</span>
            </div>
          </div>
        </section>
      </div>

      <main className="wrap onboard">
        <OnboardingWizard
          presets={PRESETS.map((preset) => ({ label: preset.label, facts: preset.business.facts }))}
        />
      </main>
    </div>
  );
}

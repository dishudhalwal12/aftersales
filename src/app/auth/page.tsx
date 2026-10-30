import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, postAuthPath } from "../../lib/auth.ts";
import { AuthPanel } from "../../components/auth/AuthPanel.tsx";
import { Logo } from "../../components/ui/Logo.tsx";

export const dynamic = "force-dynamic";

const PROOF = [
  ["R2", "Confidence < 50 never sends. It escalates."],
  ["R6", "Grounded answers cite the chunk they came from."],
  ["R7", "A dead model fails closed, not silently."],
] as const;

export default async function AuthPage() {
  const user = await getCurrentUser();
  if (user) redirect(await postAuthPath(user.id));

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
      }}
      className="auth-shell"
    >
      <section
        style={{
          padding: "48px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 40,
        }}
      >
        <Link href="/" aria-label="AfterSales AI home">
          <Logo />
        </Link>

        <div className="stack" style={{ maxWidth: 520, gap: 22 }}>
          <p className="eyebrow">SPHINX &apos;26 · PS 2.5</p>
          <h1 style={{ fontSize: 46 }}>
            Support that
            <br />
            stops guessing.
          </h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 460 }}>
            One inbox for WhatsApp, Instagram, Gmail and your phone line. The agent answers from
            your own words — and the moment it is not sure, a human gets it instead of a guess.
          </p>

          <div className="stack" style={{ gap: 10, marginTop: 6 }}>
            {PROOF.map(([rule, text]) => (
              <div className="row" key={rule} style={{ alignItems: "flex-start" }}>
                <span className="badge badge-neutral mono">{rule}</span>
                <span className="muted tiny" style={{ paddingTop: 3 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="tiny muted">Team 41 · Divyanshu Saini &amp; Pulkit Khowal</p>
      </section>

      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 32px",
          background: "rgba(255,255,255,0.35)",
          borderLeft: "1px solid var(--card-border)",
        }}
      >
        <AuthPanel />
      </section>
    </main>
  );
}

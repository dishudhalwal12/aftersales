import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, postAuthPath } from "../../lib/auth.ts";
import { AuthPanel } from "../../components/auth/AuthPanel.tsx";

export const dynamic = "force-dynamic";

const PROOF = [
  ["R2", "Confidence under 50 never sends. It escalates."],
  ["R6", "Grounded answers cite the chunk they came from."],
  ["R7", "A dead model fails closed, not silently."],
] as const;

/**
 * Sign-in, in the landing page's own language: paper white, ink black, the
 * theme's serif, and the site's blue (#1811FF) for actions. `/` is the mirrored
 * landing page, so this screen is what its "Go to Dashboard" button opens.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNotice = params.error;
  const notice = typeof rawNotice === "string" ? rawNotice : null;

  const user = await getCurrentUser();
  if (user) redirect(await postAuthPath(user.id));

  return (
    <main className="auth-view">
      <section className="auth-brand">
        <div className="auth-brandtop">
          <Link href="/" className="auth-wordmark" aria-label="AfterSales AI home">
            AfterSales<span>AI</span>
          </Link>
          <span className="auth-eyebrow">SPHINX &rsquo;26 · PS 2.5</span>
        </div>

        <div className="auth-copy">
          <h1 className="auth-h1">
            Elevate
            <br />
            your
            <br />
            after-sales.
          </h1>
          <p className="auth-lede">
            One inbox for WhatsApp, Instagram, Gmail and your phone line. The agent answers from
            your own words — and the moment it is not sure, a human gets it instead of a guess.
          </p>
          <ul className="auth-rules">
            {PROOF.map(([rule, text]) => (
              <li key={rule}>
                <span className="auth-rule-id">{rule}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-foot">Team 41 · Divyanshu Saini &amp; Pulkit Khowal</p>
      </section>

      <section className="auth-panel">
        <AuthPanel notice={notice} />
      </section>
    </main>
  );
}

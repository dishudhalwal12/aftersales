import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import "./landing.css";
import { getCurrentUser } from "../server/auth/session.ts";
import { RULE_REASONS } from "../server/ai/routing.ts";
import type { RuleId } from "../shared/domain.ts";

export const dynamic = "force-dynamic";

/**
 * The public promise (docs/design/screens slide 05).
 *
 * Visual authority is the Team 41 deck: paper white, black ink, one petrol teal,
 * no gradient and no glass. It overrides PRD §1.2's frosted-glass tokens for this
 * screen only — the dashboard keeps its own skin.
 */

const STEPS = [
  {
    n: "01",
    title: "Teach it your business",
    body: "Twelve answers compile into one versioned brain.",
  },
  {
    n: "02",
    title: "It triages every channel",
    body: "One classifier, seven ordered rules, three outcomes.",
  },
  {
    n: "03",
    title: "You only see the unsure",
    body: "Below 50 it escalates instead of guessing.",
  },
] as const;

const RULE_IDS: readonly RuleId[] = ["R1", "R2", "R3", "R4", "R5", "R6", "R7"];

const CHANNELS = ["WhatsApp", "Instagram", "Gmail", "Phone"] as const;

const HERO_VIDEO = join(process.cwd(), "public", "videos", "hero-demo.mp4");

/** A database outage degrades the landing page to its signed-out state, never to a 500. */
async function viewer(): Promise<{ email: string } | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function HeroStage({ hasVideo }: { hasVideo: boolean }) {
  return (
    <div className="landing-stage" data-video-slot>
      <div className="landing-arcs" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <span className="landing-tag">01 &middot; demo</span>

      {hasVideo ? (
        <video
          className="landing-video"
          src="/videos/hero-demo.mp4"
          controls
          playsInline
          preload="metadata"
        />
      ) : null}

      <div className="landing-stage-bar" aria-hidden="true" />
      <div className="landing-stage-foot">
        <span>hero-demo.mp4</span>
        <span>{hasVideo ? "walkthrough" : "recording pending"}</span>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const user = await viewer();
  const hasVideo = existsSync(HERO_VIDEO);

  return (
    <main className="landing" data-page="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-wordmark" aria-label="AfterSales AI home">
          AfterSales<span>.</span>
        </Link>

        <nav className="landing-links" aria-label="Landing sections">
          <a href="#how-it-works">How it works</a>
          <a href="#rules">Rules</a>
          <a href="#features">Features</a>
        </nav>

        <div className="landing-actions">
          {user ? (
            <Link href="/dashboard" className="landing-pill">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth" className="landing-ghost">
                Sign in
              </Link>
              <Link href="/auth" className="landing-pill">
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow">SPHINX &rsquo;26 &middot; PS 2.5</p>
          <h1 className="landing-h1">Your support queue, minus the guessing.</h1>
          <p className="landing-lede">
            Every inbound message read, answered from your own business facts, and escalated below
            confidence 50 — with the rule and the reason attached.
          </p>
          <div className="landing-cta">
            <Link href="/dashboard" className="landing-pill">
              Open the live demo
            </Link>
            <Link href="/auth#judge-demo" className="landing-ghost">
              Judge demo &rarr;
            </Link>
          </div>
          <p className="landing-micro">4 channels &middot; 6 chunks &middot; 7 rules</p>
        </div>

        <HeroStage hasVideo={hasVideo} />
      </section>

      <section id="how-it-works" className="landing-steps" aria-label="How it works">
        {STEPS.map((step) => (
          <article className="landing-step" key={step.n}>
            <p className="landing-step-n">{step.n}</p>
            <h2 className="landing-step-h">{step.title}</h2>
            <p className="landing-step-p">{step.body}</p>
          </article>
        ))}
      </section>

      <section id="rules" className="landing-rules" aria-label="Routing rules">
        <div className="landing-rule-strip">
          <span className="landing-rule-badge">R2</span>
          <p>
            Confidence below 50 never auto-sends. It escalates, with the rule and the reason
            attached.
          </p>
          <a className="landing-rule-link" href="#rule-list">
            Read the rules
          </a>
        </div>

        <ul id="rule-list" className="landing-rule-list">
          {RULE_IDS.map((id) => (
            <li key={id}>
              <span>{id}</span>
              {RULE_REASONS[id]}
            </li>
          ))}
        </ul>
      </section>

      <section id="features" className="landing-flow" aria-label="How a message moves">
        <p className="landing-eyebrow">How a message moves</p>
        <div className="landing-flow-rail">
          <div className="landing-flow-node">
            <b>Inbound</b> · {CHANNELS.join(" · ")}
          </div>
          <span className="landing-flow-arrow" aria-hidden="true">
            &rarr;
          </span>
          <div className="landing-flow-node">
            <b>Business brain</b> · your compiled facts, chunked and cited
          </div>
          <span className="landing-flow-arrow" aria-hidden="true">
            &rarr;
          </span>
          <div className="landing-flow-node">
            <b>R1–R7</b> · deterministic routing
          </div>
          <span className="landing-flow-arrow" aria-hidden="true">
            &rarr;
          </span>
          <div className="landing-flow-node">
            <b>Queue</b> · answered, drafted, or escalated
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <span>Team 41 &middot; Divyanshu Saini &amp; Pulkit Khowal</span>
        <span>SPHINX &rsquo;26 &middot; PS 2.5</span>
      </footer>
    </main>
  );
}

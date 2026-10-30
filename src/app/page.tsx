import Link from "next/link";
import { getCurrentUser } from "../lib/auth.ts";
import { resolveProvider } from "../lib/llm-orchestrator.ts";
import { HeroStage } from "../components/landing/HeroStage.tsx";
import { Logo } from "../components/ui/Logo.tsx";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "Teach it your business",
    body:
      "Twelve answers — prices, hours, refund policy, FAQs — compile into one versioned business_brain.md. Upload your own markdown instead if you already have it.",
  },
  {
    n: "02",
    title: "It triages every channel",
    body:
      "One classifier returns four fields: intent, urgency, sentiment, confidence. Seven ordered rules turn those four fields into exactly three outcomes: reply, draft, escalate.",
  },
  {
    n: "03",
    title: "You only see the unsure ones",
    body:
      "Below confidence 50 the agent never answers. It escalates with the rule and the reason attached, because a coin-flip is not a customer answer.",
  },
] as const;

const RULES = [
  ["R1", "the customer asks for a human", "escalate"],
  ["R2", "confidence < 50, or no grounded chunk", "escalate"],
  ["R3", "distress, or a case needing human judgment", "escalate"],
  ["R4", "urgency ≥ 80", "escalate"],
  ["R5", "the channel is draft-only", "hold as draft"],
  ["R6", "grounded, confident, not urgent", "auto-reply"],
  ["R7", "the classifier failed", "fail safe"],
] as const;

const FEATURES = [
  {
    title: "Four channels, one queue",
    body:
      "WhatsApp, Instagram DM, Gmail and one voice line land in the same list. Channel adapters normalize; nothing downstream sees a raw provider payload.",
  },
  {
    title: "Every answer cites its source",
    body:
      "A reply may only be sent when at least one retrieved chunk from this business is cited. Fabricated chunk ids are filtered before routing decides.",
  },
  {
    title: "Tenant isolation is structural",
    body:
      "businessId comes from the session and is checked on every read. Another owner's ticket id returns 403 — there is no code path that takes it from the model.",
  },
  {
    title: "Webhooks are idempotent",
    body:
      "A unique externalMessageId means a replayed webhook creates one ticket and one decision, not two replies to the same customer.",
  },
  {
    title: "Weekly recurring complaints",
    body:
      "Tickets are grouped by intent and sentiment, so the same complaint surfacing eleven times reads as a number instead of a feeling.",
  },
  {
    title: "It fails closed",
    body:
      "If the model key is missing or the call dies, the pipeline writes R7, marks the ticket failed and sends nothing. It never fakes a success.",
  },
] as const;

export default async function LandingPage() {
  const user = await getCurrentUser();
  const provider = resolveProvider({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });
  const degraded = provider === "heuristic";

  return (
    <>
      <header className="nav">
        <div className="wrap nav-inner">
          <Logo />
          <nav className="nav-links" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#rules">Routing rules</a>
            <a href="#features">Features</a>
            <Link href={user ? "/dashboard" : "/auth"} className="btn btn-primary btn-sm">
              {user ? "Go to dashboard" : "Get started"}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <div className="wrap">
          <section className="hero">
            <div>
              <p className="eyebrow">SPHINX &apos;26 · Problem statement 2.5</p>
              <h1>
                Your support queue,
                <br />
                minus the guessing.
              </h1>
              <p className="hero-sub">
                AfterSales AI reads every inbound message, answers the repetitive ones from your own
                business facts, and hands you the ones it is not sure about — with the rule and the
                reason attached.
              </p>
              <div className="hero-cta">
                <Link href={user ? "/dashboard" : "/auth"} className="btn btn-primary">
                  {user ? "Open the dashboard" : "Open the live demo"}
                </Link>
                <a href="#rules" className="btn">
                  See the routing rules
                </a>
              </div>
              <div className="hero-note">
                <span>4 channels · 6 chunks per business · 7 ordered rules</span>
                <span>
                  {degraded
                    ? "Runs with no model key — the offline classifier is labelled on screen"
                    : "Model path live"}
                </span>
              </div>
            </div>
            <HeroStage />
          </section>
        </div>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">How it works</p>
                <h2>Three steps, one contract</h2>
              </div>
              <p className="tiny muted" style={{ maxWidth: 320 }}>
                The classifier proposes four fields. The router disposes. Nothing about the decision
                lives inside the language model.
              </p>
            </div>
            <div className="grid-3">
              {STEPS.map((step) => (
                <div className="glass step-card" key={step.n}>
                  <span className="step-num">{step.n}</span>
                  <h3 style={{ fontSize: 16 }}>{step.title}</h3>
                  <p className="muted tiny" style={{ lineHeight: 1.6 }}>
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="rules">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">The decision surface</p>
                <h2>Seven rules, first match wins</h2>
              </div>
              <p className="tiny muted" style={{ maxWidth: 340 }}>
                R1–R4 escalate. R5 holds a draft. R6 is the repetitive volume, handled. R7 exists so a
                broken classifier is never a silent reply.
              </p>
            </div>
            <div className="glass panel" style={{ padding: 8 }}>
              <table className="rule-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rule</th>
                    <th>Condition</th>
                    <th style={{ width: 150 }}>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map(([rule, condition, outcome]) => (
                    <tr key={rule} data-hit={rule === "R2"}>
                      <td>
                        <span className="badge badge-neutral mono">{rule}</span>
                      </td>
                      <td>{condition}</td>
                      <td>
                        <span
                          className={`badge ${
                            outcome === "auto-reply"
                              ? "badge-sent"
                              : outcome === "hold as draft"
                                ? "badge-draft"
                                : "badge-esc"
                          }`}
                        >
                          {outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              R2 is the product: confidence below 50 is a human&apos;s job, not a language
              model&apos;s.
            </p>
          </div>
        </section>

        <section className="section" id="features">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">What is inside</p>
                <h2>Built to be inspected, not trusted</h2>
              </div>
            </div>
            <div className="grid-3">
              {FEATURES.map((feature) => (
                <div className="glass feature-card" key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="glass panel" style={{ padding: 34, textAlign: "center" }}>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Two seeded businesses, one click
              </p>
              <h2 style={{ fontSize: 28 }}>Ask CloudPulse about its Pro Plan. Then ask the dental clinic.</h2>
              <p className="muted" style={{ maxWidth: 620, margin: "10px auto 20px" }}>
                Same question, same pipeline, different answer — or a clean escalation when the facts
                are not there. That contrast is the whole product.
              </p>
              <Link href="/auth" className="btn btn-primary">
                1-click judge demo login
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", width: "100%" }}>
          <span>Team 41 · Divyanshu Saini &amp; Pulkit Khowal · PS 2.5</span>
          <span>
            {degraded
              ? "Offline classifier active — answers are extractive and cited."
              : "Model-backed classifier active."}
          </span>
        </div>
      </footer>
    </>
  );
}

"use client";

import type { DecisionSheet, LayaDecision } from "../../shared/domain.ts";

const HEADLINE_ID = "urgent_now";

/** The decisions whose "yes" is a risk worth colouring, rather than just a label. */
const RISK_IDS: ReadonlySet<string> = new Set([
  "churn_risk",
  "sensitive_case",
  "human_requested",
  "refund_requested",
]);

type Tone = "sent" | "draft" | "esc" | "neutral";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Option labels are model tokens (`billing_question`); the panel shows words. */
function humanise(label: string): string {
  return label.replace(/_/g, " ");
}

/**
 * How strong the *verdict* is, not how likely "yes" is.
 *
 * A yes/no answer of "not urgent" at P(true)=0.07 is a 93% answer, and a meter that
 * showed 7% would read as a weak decision when the model is actually sure.
 */
function strength(decision: LayaDecision): number {
  if (decision.kind !== "noul") return decision.probability;
  const isYes = decision.verdict === "yes" || decision.verdict === "urgent";
  return isYes ? decision.probability : 1 - decision.probability;
}

function toneFor(decision: LayaDecision): Tone {
  if (decision.id === HEADLINE_ID) {
    return decision.verdict === "urgent" ? "esc" : "sent";
  }
  if (RISK_IDS.has(decision.id)) {
    const flagged = decision.kind === "noul" ? decision.probability >= 0.5 : false;
    return flagged ? "draft" : "neutral";
  }
  if (decision.kind === "score") {
    const level = decision.value ?? 0;
    if (level >= 0.66) return "esc";
    if (level >= 0.33) return "draft";
    return "sent";
  }
  return "neutral";
}

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  sent: "badge-sent",
  draft: "badge-draft",
  esc: "badge-esc",
  neutral: "badge-neutral",
};

const TONE_METER: Readonly<Record<Tone, string>> = {
  sent: "meter-sent",
  draft: "meter-draft",
  esc: "meter-esc",
  neutral: "meter-sent",
};

function Parameter({ decision }: { decision: LayaDecision }) {
  const tone = toneFor(decision);
  const value = Math.round(strength(decision) * 100);

  return (
    <div className="decision-card">
      <div className="row-between" style={{ gap: 8 }}>
        <span className="tiny decision-title">{decision.title}</span>
        <span className="tiny muted mono">{percent(strength(decision))}</span>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <span className={`badge ${TONE_CLASS[tone]}`}>{humanise(decision.verdict)}</span>
        <span className="tiny muted">conf {decision.confidence.toFixed(2)}</span>
      </div>

      <div
        className={`meter ${TONE_METER[tone]}`}
        style={{ marginTop: 6, height: 5 }}
        role="img"
        aria-label={`${decision.title}: ${humanise(decision.verdict)}, ${value} out of 100`}
      >
        <span style={{ width: `${Math.max(3, value)}%` }} />
      </div>

      {decision.kind === "choice" && decision.options.length > 1 && (
        <p className="tiny muted clamp-2" style={{ marginTop: 6 }}>
          {decision.options
            .slice()
            .sort((left, right) => right.probability - left.probability)
            .slice(0, 3)
            .map((option) => `${humanise(option.label)} ${percent(option.probability)}`)
            .join(" · ")}
        </p>
      )}

      {decision.kind === "score" && decision.options.length > 0 && (
        <p className="tiny muted clamp-2" style={{ marginTop: 6 }}>
          {decision.options
            .slice()
            .sort((left, right) => right.probability - left.probability)
            .slice(0, 2)
            .map((option) => `${humanise(option.label)} ${percent(option.probability)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * The typed decisions the local Laya model made about this ticket.
 *
 * Labelled advisory on the panel itself: R1–R7 routing reads the classifier output only,
 * so a judge can see the second opinion without mistaking it for the thing that decided
 * what happened to the customer.
 */
export function DecisionSheetPanel({
  sheet,
  unavailableReason,
  classifierUrgency,
  classifierSentiment,
}: {
  sheet: DecisionSheet | null;
  unavailableReason?: string | null;
  classifierUrgency: number;
  classifierSentiment: string;
}) {
  if (sheet === null) {
    return (
      <div className="glass panel-tight" style={{ marginTop: 14 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Typed decisions · Laya
        </p>
        <p className="tiny muted">
          No typed decisions for this ticket.
          {unavailableReason ? ` ${unavailableReason}` : " The local model did not answer when it was triaged."}
        </p>
      </div>
    );
  }

  const headline = sheet.decisions.find((decision) => decision.id === HEADLINE_ID) ?? null;
  const parameters = sheet.decisions.filter((decision) => decision.id !== HEADLINE_ID);
  const headlineTone = headline === null ? "neutral" : toneFor(headline);

  return (
    <div className="glass panel-tight" style={{ marginTop: 14 }}>
      <div className="row-between" style={{ alignItems: "baseline", gap: 8 }}>
        <p className="eyebrow">Typed decisions · Laya</p>
        <span className="tiny muted mono" title={sheet.model}>
          {Math.round(sheet.latencyMs)} ms
        </span>
      </div>

      {headline !== null && (
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span
            className={`badge ${TONE_CLASS[headlineTone]}`}
            style={{ fontSize: 13, fontWeight: 640, padding: "4px 10px" }}
          >
            {headline.verdict === "urgent" ? "Urgent" : "Not urgent"}
          </span>
          <span className="tiny muted">
            a human within the hour · {percent(strength(headline))} · conf{" "}
            {headline.confidence.toFixed(2)}
          </span>
        </div>
      )}

      <div className="decision-grid">
        {parameters.map((decision) => (
          <Parameter key={decision.id} decision={decision} />
        ))}
      </div>

      <p className="tiny muted" style={{ marginTop: 10 }}>
        Advisory only — R1–R7 still reads the classifier (urgency {classifierUrgency}/100 ·{" "}
        {classifierSentiment}). A disagreement is the interesting part, not an override.
      </p>
    </div>
  );
}

/** The stored reason a ticket has no decision sheet, in words a judge can read. */
export const DECISION_SHEET_REASON_TEXT: Readonly<Record<string, string>> = {
  not_configured: "The Laya decision service is not configured on this deployment.",
  unreachable: "The Laya decision service was unreachable when this ticket was triaged.",
  timeout: "The Laya decision service timed out when this ticket was triaged.",
  rejected: "The Laya decision service refused this message (it may be too long to score).",
  invalid_response: "The Laya decision service returned an unexpected body.",
};

export function decisionSheetReasonText(reason: string | null | undefined): string | null {
  if (typeof reason !== "string") return null;
  return DECISION_SHEET_REASON_TEXT[reason] ?? null;
}

/** The queue-row version: one glance at what the local model called this ticket. */
export function LayaHeadline({ sheet }: { sheet: DecisionSheet | null }) {
  const headline = sheet?.decisions.find((decision) => decision.id === HEADLINE_ID);
  if (!headline) return null;
  const urgent = headline.verdict === "urgent";
  return (
    <span
      className={`badge ${urgent ? "badge-esc" : "badge-sent"}`}
      title={`Laya · ${percent(strength(headline))} confident`}
    >
      {urgent ? "urgent" : "not urgent"}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./client.ts";
import { DecisionSheetPanel, decisionSheetReasonText } from "./DecisionSheetPanel.tsx";
import type { TextQueryResponse } from "../../shared/api.ts";
import {
  ActionPill,
  ChannelBadge,
  ConfidenceMeter,
  RULE_COPY,
  RuleBadge,
  SentimentPill,
} from "../ui/Badges.tsx";

const SAMPLES = [
  "What is the price of the Pro Plan and does it include WhatsApp invoicing?",
  "What are your prices and hours?",
  "Can I get a refund if I cancel after three days?",
  "Let me talk to a real human manager.",
  "You charged me twice and nobody is responding. This is unacceptable.",
  "Can CloudPulse sync with my Tally ledger?",
];

export function AiTextModal({
  businessId,
  businessName,
  onClose,
  onAnswered,
}: {
  businessId: string;
  businessName: string;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const [query, setQuery] = useState(SAMPLES[0] ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TextQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(text: string) {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch<TextQueryResponse>("/api/ai/text-query", {
        method: "POST",
        body: JSON.stringify({
          businessId,
          channel: "TEXT_MODAL",
          customerName: "Judge Tester",
          customerHandle: "judge@sphinx.mnit.ac.in",
          query: text,
        }),
      });
      setResult(response);
      onAnswered();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Test the AI agent"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal fade-in">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Test my AI agent</p>
            <h2 style={{ fontSize: 22, marginTop: 4 }}>{businessName}</h2>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              Same pipeline as every channel: retrieve → classify → R1–R7 → ticket.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim().length > 0) void ask(query.trim());
          }}
        >
          <label className="field">
            <span>Customer message</span>
            <textarea
              className="textarea"
              value={query}
              maxLength={2000}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask what a customer would ask…"
            />
          </label>

          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {SAMPLES.slice(0, 4).map((sample) => (
              <button
                key={sample}
                type="button"
                className="chip"
                onClick={() => {
                  setQuery(sample);
                  void ask(sample);
                }}
              >
                {sample.length > 46 ? `${sample.slice(0, 46)}…` : sample}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => {
                const adversarial = "You charged me twice and nobody is responding. This is unacceptable.";
                setQuery(adversarial);
                void ask(adversarial);
              }}
            >
              distressed customer
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const human = "Let me talk to a real human manager.";
                setQuery(human);
                void ask(human);
              }}
            >
              wants a human
            </button>
          </div>

          <div className="row-between">
            <p className="tiny muted">
              Confidence &lt; 50 can never send — it escalates with the reason attached.
            </p>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Thinking…" : "Send as customer"}
            </button>
          </div>
        </form>

        {error !== null && (
          <p className="banner banner-danger" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        {result !== null && (
          <div className="fade-in" style={{ marginTop: 18 }}>
            <hr className="hairline" style={{ marginBottom: 14 }} />

            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <RuleBadge rule={result.routingRuleHit} />
              <ActionPill status={result.actionStatus} />
              <SentimentPill sentiment={result.sentiment} />
              <span className="badge badge-neutral">{result.specialist}</span>
              <span className="badge badge-neutral mono">{result.intent}</span>
            </div>

            <p className="tiny muted" style={{ marginTop: 10 }}>
              {result.routingRuleHit} · {RULE_COPY[result.routingRuleHit] ?? ""}
            </p>

            <div className="grid-2" style={{ marginTop: 12, gap: 16 }}>
              <div>
                <p className="tiny muted">Confidence</p>
                <ConfidenceMeter value={result.confidenceScore} actionStatus={result.actionStatus} />
              </div>
              <div>
                <p className="tiny muted">Urgency · {result.urgencyScore}/100</p>
                <div className={`meter ${result.urgencyScore >= 80 ? "meter-esc" : "meter-draft"}`}>
                  <span style={{ width: `${Math.max(2, result.urgencyScore)}%` }} />
                </div>
              </div>
            </div>

            <DecisionSheetPanel
              sheet={result.decisionSheet}
              unavailableReason={decisionSheetReasonText(result.decisionSheetError)}
              classifierUrgency={result.urgencyScore}
              classifierSentiment={result.sentiment}
            />

            <div className="glass panel-tight" style={{ marginTop: 14, background: "#fff" }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                {result.actionStatus === "answered"
                  ? "Sent to customer"
                  : result.actionStatus === "draft"
                    ? "Held as a draft"
                    : result.actionStatus === "failed"
                      ? "Classifier failed — nothing sent"
                      : "Escalated to a human"}
              </p>
              <p style={{ fontSize: 14 }}>{result.answer}</p>
            </div>

            <p className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
              Sources ({result.sources.length})
            </p>
            {result.sources.length === 0 ? (
              <p className="tiny muted">
                No chunk was cited, so nothing may be auto-sent. This is the R2 floor working.
              </p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {result.sources.map((source) => (
                  <details className="source-card" key={source.chunkId}>
                    <summary>
                      <span className="mono">{source.chunkId}</span> · {source.section}
                    </summary>
                    <p className="muted" style={{ marginTop: 8 }}>
                      {source.excerpt}
                    </p>
                  </details>
                ))}
              </div>
            )}

            <div className="row" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
              <ChannelBadge channel="TEXT_MODAL" />
              <span className={`badge ${result.degraded ? "badge-draft" : "badge-sent"}`}>
                {result.degraded ? "offline classifier" : `provider: ${result.provider}`}
              </span>
              <span className="badge badge-neutral mono">{result.ticketId.slice(0, 12)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

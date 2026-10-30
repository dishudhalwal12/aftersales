"use client";

import { useState } from "react";
import { apiFetch, emitDataChanged } from "./client.ts";
import type {
  VoiceSessionResponse,
  VoiceToolSearchResponse,
  VoiceWebhookResponse,
} from "../../shared/api.ts";
import { ChannelBadge } from "../ui/Badges.tsx";

const STEPS = ["initiated", "ringing", "in_progress", "completed"] as const;

export function VoiceTestPanel({
  businessId,
  businessName,
  sarvamConfigured,
}: {
  businessId: string;
  businessName: string;
  sarvamConfigured: boolean;
}) {
  const [phone, setPhone] = useState("+919812345678");
  const [session, setSession] = useState<VoiceSessionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("What is your refund policy?");
  const [lookup, setLookup] = useState<VoiceToolSearchResponse | null>(null);

  const [transcript, setTranscript] = useState(
    "Caller: My root canal is hurting, can someone help me today?\nAgent: I have the clinic's hours and pricing, but pain needs a human. Asking the clinic to step in.",
  );
  const [escalate, setEscalate] = useState(true);
  const [completion, setCompletion] = useState<VoiceWebhookResponse | null>(null);

  const stage = session?.status ?? null;

  async function startSession() {
    setBusy(true);
    setError(null);
    setCompletion(null);
    setLookup(null);
    try {
      const response = await apiFetch<VoiceSessionResponse>("/api/voice/start-session", {
        method: "POST",
        body: JSON.stringify({ businessId, judgePhone: phone }),
      });
      setSession(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not start the session");
    } finally {
      setBusy(false);
    }
  }

  async function askAsCaller() {
    if (session === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<VoiceToolSearchResponse>("/api/voice/sarvam-tool-search", {
        method: "POST",
        body: JSON.stringify({
          sessionId: session.sessionId,
          demoPin: session.demoPin,
          callerPhone: phone,
          query,
        }),
      });
      setLookup(response);
      setSession({ ...session, status: "in_progress" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "tool search failed");
    } finally {
      setBusy(false);
    }
  }

  async function finishCall() {
    if (session === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<VoiceWebhookResponse>("/api/voice/sarvam-webhook", {
        method: "POST",
        body: JSON.stringify({
          sessionId: session.sessionId,
          status: "completed",
          transcript,
          durationSeconds: 96,
          escalateToHuman: escalate,
          citedChunkIds: lookup?.citedChunkIds ?? [],
        }),
      });
      setCompletion(response);
      setSession({ ...session, status: "completed" });
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not record the call");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>Voice test</h2>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            One rented number, per-call business context. The session binds your phone and a 4-digit
            PIN to {businessName} for ten minutes.
          </p>
        </div>
        <span className={`badge ${sarvamConfigured ? "badge-sent" : "badge-draft"}`}>
          {sarvamConfigured ? "Sarvam configured" : "Sarvam not configured"}
        </span>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="glass panel">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 220px" }}>
            <span>Your phone (E.164)</span>
            <input
              className="input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+919812345678"
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startSession()}>
            Call me now
          </button>
        </div>

        {session !== null && (
          <div className="fade-in" style={{ marginTop: 18 }}>
            <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="voice-stepper" data-voice-status={session.status}>
                {STEPS.map((step, index) => {
                  const activeIndex = STEPS.indexOf((stage ?? "initiated") as (typeof STEPS)[number]);
                  return (
                    <span
                      key={step}
                      className="vs"
                      data-active={step === stage}
                      data-done={index < activeIndex}
                    >
                      <span
                        className="dot"
                        aria-hidden="true"
                        style={{ background: index <= activeIndex ? "currentColor" : "var(--card-border-strong)" }}
                      />
                      {step.replace("_", " ")}
                    </span>
                  );
                })}
                {session.callMode === "dry_run" && (
                  <span className="vs" data-active="true" data-dry-run="true">
                    dry run — no call placed
                  </span>
                )}
              </div>
              <span className="tiny muted mono">{session.sessionId.slice(0, 14)}</span>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 18, flexWrap: "wrap" }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  Fallback PIN
                </p>
                <span className="pin">{session.demoPin}</span>
              </div>
              <div className="stack" style={{ gap: 4, fontSize: 12.5, maxWidth: 420 }}>
                <p>
                  <b>Context mode:</b> {session.contextInjectionMode}
                </p>
                <p className="muted">
                  {session.callMode === "dry_run"
                    ? session.callPlacementReason
                    : `Outbound call requested (${session.callPlacementOk ? "accepted" : "rejected"}).`}
                </p>
              </div>
            </div>

            {session.callMode === "dry_run" && (
              <p className="banner" style={{ marginTop: 14 }}>
                <span>
                  <b>Dry run.</b> No call was placed and nothing below pretends one was. The session,
                  the PIN, the scoped retrieval and the ticket write-back are all real — they are
                  driven from this panel instead of from telephony.
                </span>
              </p>
            )}

            <hr className="hairline" style={{ margin: "18px 0" }} />

            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Step 2 — what the voice agent hears back mid-call
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ flex: "1 1 260px" }}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What the caller asked"
              />
              <button type="button" className="btn" disabled={busy} onClick={() => void askAsCaller()}>
                Run tool search
              </button>
            </div>

            {lookup !== null && (
              <div className="glass panel-tight fade-in" style={{ marginTop: 12, background: "#fff" }}>
                <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span className="badge badge-neutral">{lookup.businessName}</span>
                  <span className={`badge ${lookup.escalateToHuman ? "badge-esc" : "badge-sent"}`}>
                    {lookup.escalateToHuman ? "escalate to human" : `confidence ${lookup.confidenceScore}`}
                  </span>
                </div>
                <p style={{ marginTop: 10, fontSize: 13.5 }}>{lookup.groundedFacts}</p>
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {lookup.citedChunkIds.length === 0 ? (
                    <span className="tiny muted">No chunk cited — the agent will not answer.</span>
                  ) : (
                    lookup.citedChunkIds.map((id) => (
                      <span key={id} className="badge badge-neutral mono">
                        {id}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            <hr className="hairline" style={{ margin: "18px 0" }} />

            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Step 3 — call completion writes back to the queue
            </p>
            <label className="field">
              <span>Transcript</span>
              <textarea
                className="textarea"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
              />
            </label>
            <div className="row-between" style={{ marginTop: 10, flexWrap: "wrap", gap: 10 }}>
              <label className="row" style={{ gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={escalate}
                  onChange={(event) => setEscalate(event.target.checked)}
                />
                Caller needed a human
              </label>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void finishCall()}>
                Record completed call
              </button>
            </div>

            {completion !== null && (
              <p className="banner banner-ok fade-in" style={{ marginTop: 12 }}>
                <span>
                  Call recorded · session {completion.sessionStatus} · ticket{" "}
                  <span className="mono">{completion.ticketId.slice(0, 12)}</span> · rule{" "}
                  <b>{completion.routingRuleHit}</b> ({completion.actionStatus}). It is in the live
                  queue now.
                </span>
              </p>
            )}
          </div>
        )}

        {session === null && (
          <p className="tiny muted" style={{ marginTop: 14 }}>
            Tip: run this for {businessName}, then switch the business and run it again. The same
            number answers with the other business&apos;s facts, because context is per call — the
            saved prompt is never mutated.
          </p>
        )}
      </div>

      <div className="glass panel" style={{ marginTop: 16 }}>
        <p className="eyebrow">What is real here</p>
        <ul className="muted tiny" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Session creation, PIN binding, expiry and tenant scoping — real, in the database.</li>
          <li>Mid-call retrieval against this business only — real, same retriever as text.</li>
          <li>Write-back into the live queue with a rule and a reason — real.</li>
          <li>
            The telephone leg itself — {sarvamConfigured ? "configured, calls are placed." : "not placed on this deployment (no Sarvam keys)."}
          </li>
        </ul>
        <div className="row" style={{ marginTop: 12 }}>
          <ChannelBadge channel="VOICE" />
        </div>
      </div>
    </div>
  );
}

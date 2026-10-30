"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, timeAgo, useDataChanged } from "./client.ts";
import type { BrainResponse, InsightsResponse } from "../../shared/api.ts";
import { Metric } from "../ui/Badges.tsx";

export function BrainInsightsPanel({ businessId }: { businessId: string }) {
  const [brain, setBrain] = useState<BrainResponse | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [brainResponse, insightResponse] = await Promise.all([
        apiFetch<BrainResponse>(`/api/businesses/${businessId}/brain`),
        apiFetch<InsightsResponse>(`/api/businesses/${businessId}/insights`),
      ]);
      setBrain(brainResponse);
      setInsights(insightResponse);
      setDraft(brainResponse.compiledBrainMd);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not load the brain");
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useDataChanged(() => {
    void load();
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${businessId}/brain`, {
        method: "PATCH",
        body: JSON.stringify({ compiledBrainMd: draft }),
      });
      setSaved(`Saved — chunks recompiled from the markdown.`);
      setEditing(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not save the brain");
    } finally {
      setBusy(false);
    }
  }

  const sentimentTotal = insights
    ? insights.sentiment.positive +
      insights.sentiment.neutral +
      insights.sentiment.frustrated +
      insights.sentiment.distressed
    : 0;

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>Business brain &amp; insights</h2>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            The markdown is the source of truth. Chunks are derived, citable, and rebuilt on save.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {brain !== null && <span className="badge badge-neutral">brain v{brain.brainVersion}</span>}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setEditing((value) => !value);
              setSaved(null);
            }}
          >
            {editing ? "Cancel" : "Edit markdown"}
          </button>
        </div>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {saved !== null && (
        <p className="banner banner-ok" role="status" style={{ marginBottom: 12 }}>
          {saved}
        </p>
      )}

      {insights !== null && (
        <>
          <div className="glass panel">
            <div className="row-between" style={{ marginBottom: 14 }}>
              <p className="eyebrow">Last {insights.windowDays} days</p>
              <span className="tiny muted">
                busiest channel {insights.busiestChannel ?? "—"} · most-hit rule {insights.topRule ?? "—"}
              </span>
            </div>
            <div className="grid-4">
              <Metric value={insights.totalTickets} label="tickets" />
              <Metric value={`${insights.autoAnswerRate}%`} label="answered by the agent" />
              <Metric value={`${insights.escalationRate}%`} label="escalated to a human" />
              <Metric value={insights.citations} label="grounded answers" />
            </div>

            <div style={{ marginTop: 18 }}>
              <p className="tiny muted" style={{ marginBottom: 6 }}>
                Sentiment mix
              </p>
              <div
                className="bar"
                style={{ height: 10, display: "flex", gap: 2, background: "transparent" }}
                role="img"
                aria-label="sentiment distribution"
              >
                {(
                  [
                    ["positive", "#10B981"],
                    ["neutral", "#A1A1AA"],
                    ["frustrated", "#F59E0B"],
                    ["distressed", "#EF4444"],
                  ] as const
                ).map(([key, colour]) => {
                  const value = insights.sentiment[key];
                  const width = sentimentTotal === 0 ? 0 : (value / sentimentTotal) * 100;
                  return (
                    <span
                      key={key}
                      style={{ width: `${width}%`, background: colour, borderRadius: 999, minWidth: value > 0 ? 6 : 0 }}
                      title={`${key}: ${value}`}
                    />
                  );
                })}
              </div>
              <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                {(["positive", "neutral", "frustrated", "distressed"] as const).map((key) => (
                  <span key={key} className="tiny muted">
                    {key} <b style={{ color: "var(--ink)" }}>{insights.sentiment[key]}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="glass panel" style={{ marginTop: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              Recurring complaints {insights.recurringComplaints.length === 0 && "(none repeated yet)"}
            </p>
            {insights.recurringComplaints.map((complaint) => (
              <div className="kv" key={complaint.intent} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <div className="row-between" style={{ width: "100%" }}>
                  <span className="mono" style={{ fontSize: 12.5 }}>
                    {complaint.intent}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="badge badge-neutral">{complaint.count} tickets</span>
                    <span className={`badge ${complaint.negativeShare >= 50 ? "badge-esc" : "badge-neutral"}`}>
                      {complaint.negativeShare}% negative
                    </span>
                    <span className="tiny muted">{timeAgo(complaint.lastSeen)}</span>
                  </span>
                </div>
                <p className="tiny muted clamp-2">{complaint.sample}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="glass panel" style={{ marginTop: 16 }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <p className="eyebrow">Chunks ({brain?.chunkCount ?? 0})</p>
          {brain !== null && <span className="tiny muted mono">{brain.businessName}</span>}
        </div>

        {brain === null && <div className="skeleton" style={{ height: 160 }} />}

        {brain !== null && !editing && (
          <div className="stack" style={{ gap: 8 }}>
            {brain.chunks.map((chunk) => (
              <details className="source-card" key={chunk.chunkId}>
                <summary>
                  <span className="mono">{chunk.chunkId}</span> · {chunk.section}
                  <span className="tiny muted" style={{ marginLeft: 8 }}>
                    {chunk.content.split(/\s+/).length} words
                  </span>
                </summary>
                <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
                  {chunk.content}
                </p>
                <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                  {chunk.keywords.slice(0, 10).map((keyword) => (
                    <span key={keyword} className="badge badge-neutral mono" style={{ fontSize: 10 }}>
                      {keyword}
                    </span>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {brain !== null && editing && (
          <div className="stack">
            <label className="field">
              <span>business_brain.md</span>
              <textarea
                className="textarea"
                style={{ minHeight: 320, fontFamily: "var(--mono)", fontSize: 12 }}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <div className="row-between">
              <p className="tiny muted">
                Saving bumps the brain version and re-derives every chunk with new ids.
              </p>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save & recompile"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

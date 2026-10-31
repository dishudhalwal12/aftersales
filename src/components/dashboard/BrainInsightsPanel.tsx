"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, timeAgo, useDataChanged } from "./client.ts";
import type {
  BrainResponse,
  InsightsResponse,
  SentimentTrendLabel,
  WeeklyComplaintView,
} from "../../shared/api.ts";
import { Metric } from "../ui/Badges.tsx";
import { complaintDisplay } from "../../shared/insights.ts";

const TREND_LABEL = {
  improving: "improving",
  stable: "steady",
  worsening: "worsening",
  baseline: "first week",
} satisfies Record<SentimentTrendLabel, string>;

const TREND_CLASS = {
  improving: "badge-sent",
  stable: "badge-neutral",
  worsening: "badge-esc",
  baseline: "badge-neutral",
} satisfies Record<SentimentTrendLabel, string>;

const DIRECTION_LABEL = {
  new: "new",
  rising: "rising",
  cooling: "cooling",
  steady: "steady",
} satisfies Record<WeeklyComplaintView["direction"], string>;

const DIRECTION_CLASS = {
  new: "badge-draft",
  rising: "badge-esc",
  cooling: "badge-sent",
  steady: "badge-neutral",
} satisfies Record<WeeklyComplaintView["direction"], string>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UTC day label, so the server's prerender and the browser agree during hydration. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** The stored weekEnd is the exclusive next Monday; show the Sunday the week covers. */
function weekRange(startIso: string, endIso: string): string {
  const end = new Date(new Date(endIso).getTime() - 24 * 60 * 60 * 1000);
  return `${dayLabel(startIso)} – ${dayLabel(end.toISOString())}`;
}

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

  const weeklyReport = insights?.weeklyReport ?? null;
  const complaints = complaintDisplay({
    weekly: weeklyReport?.recurringComplaints ?? [],
    live: insights?.recurringComplaints ?? [],
  });

  return (
    <div>
      <div className="panel-head">
        <div>
          <p className="eyebrow">03 — Brain</p>
          <h2>Business brain &amp; insights</h2>
          <p className="panel-lede">
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

      {/* Both headline cards render before the fetch resolves, so the tab always
          names the feature and a slow API shows a skeleton instead of a gap. */}
      <div className="glass panel">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div>
            <p className="eyebrow">Sentiment trend</p>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              {insights === null
                ? "A rolling seven-day sentiment index, compared with the seven days before it."
                : `Rolling ${insights.windowDays} days · ${insights.negativeShare}% negative${
                    insights.previousSentimentScore === null
                      ? " · no earlier window to compare"
                      : ` · ${insights.previousSentimentScore}/100 the ${insights.windowDays} days before`
                  }`}
            </p>
          </div>
          {insights !== null && (
            <span className={`badge ${TREND_CLASS[insights.sentimentTrend]}`}>
              {insights.sentimentScore}/100 · {TREND_LABEL[insights.sentimentTrend]}
            </span>
          )}
        </div>
        {insights === null ? (
          <div className="skeleton" style={{ height: 64 }} />
        ) : (
          <div className="row" style={{ gap: 6, alignItems: "flex-end", height: 64, marginTop: 6 }}>
            {insights.dailySentiment.map((day) => {
              const share = day.negativeShare;
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.total} tickets, ${day.negative} negative`}
                  style={{
                    flex: 1,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: "100%",
                      maxWidth: 26,
                      height: `${day.total === 0 ? 4 : Math.max(10, share)}%`,
                      borderRadius: 4,
                      background:
                        day.total === 0
                          ? "var(--slate-bg)"
                          : share >= 50
                            ? "var(--crimson-line)"
                            : share > 0
                              ? "var(--amber-line)"
                              : "var(--emerald-line)",
                    }}
                  />
                  <span className="tiny muted" style={{ fontSize: 9.5 }}>
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {insights !== null && (
        <div className="glass panel" style={{ marginTop: 16 }}>
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
                    style={{
                      width: `${width}%`,
                      background: colour,
                      borderRadius: 999,
                      minWidth: value > 0 ? 6 : 0,
                    }}
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
      )}

      <div className="glass panel" style={{ marginTop: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <p className="eyebrow">Automatic weekly report</p>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              {insights === null
                ? "One report per completed week, generated without anyone clicking."
                : weeklyReport === null
                  ? "The completed week's report is not available yet."
                  : `${weekRange(weeklyReport.weekStart, weeklyReport.weekEnd)} · generated ${timeAgo(weeklyReport.generatedAt)}`}
            </p>
          </div>
          {weeklyReport !== null && (
            <span
              className={`badge ${weeklyReport.trigger === "cron" ? "badge-sent" : "badge-neutral"}`}
            >
              {weeklyReport.trigger === "cron" ? "scheduled run" : "first view"}
            </span>
          )}
        </div>

        {insights === null ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : weeklyReport === null ? (
          <p className="tiny muted">
            The live metrics above still cover the last {insights.windowDays} days.
          </p>
        ) : (
          <>
            <div className="grid-4">
              <Metric value={weeklyReport.totalTickets} label="tickets in the week" />
              <Metric
                value={`${weeklyReport.sentimentScore}/100`}
                label={TREND_LABEL[weeklyReport.sentimentTrend]}
              />
              <Metric value={`${weeklyReport.escalationRate}%`} label="escalated to a human" />
              <Metric value={`${weeklyReport.autoAnswerRate}%`} label="answered by the agent" />
            </div>

            <div className="row-between" style={{ marginTop: 16, marginBottom: 8 }}>
              <p className="eyebrow">Recurring complaints</p>
              <span className="tiny muted">
                {complaints.source === "weekly"
                  ? "count · negative share · vs last week"
                  : "live · last 7 days"}
              </span>
            </div>
            {complaints.source === "rolling" && complaints.rows.length > 0 && (
              <p className="tiny muted" style={{ marginBottom: 6 }}>
                Nothing repeated in the completed week yet — these repeated over the last{" "}
                {insights.windowDays} days.
              </p>
            )}
            {complaints.rows.length === 0 && (
              <p className="tiny muted">No complaint repeated in this week.</p>
            )}
            {complaints.rows.map((complaint) => (
              <div
                className="kv"
                key={complaint.intent}
                style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}
              >
                <div className="row-between" style={{ width: "100%" }}>
                  <span className="mono" style={{ fontSize: 12.5 }}>
                    {complaint.intent}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="badge badge-neutral">{complaint.count} tickets</span>
                    <span
                      className={`badge ${complaint.negativeShare >= 50 ? "badge-esc" : "badge-neutral"}`}
                    >
                      {complaint.negativeShare}% negative
                    </span>
                    {complaint.direction !== null ? (
                      <span className={`badge ${DIRECTION_CLASS[complaint.direction]}`}>
                        {DIRECTION_LABEL[complaint.direction]}
                        {complaint.previousCount === null || complaint.previousCount === 0
                          ? ""
                          : ` ${complaint.previousCount}→${complaint.count}`}
                      </span>
                    ) : (
                      <span className="tiny muted">last {timeAgo(complaint.lastSeen)}</span>
                    )}
                  </span>
                </div>
                <p className="tiny muted clamp-2">{complaint.sample}</p>
              </div>
            ))}

            <p className="tiny muted" style={{ marginTop: 12 }}>
              Next report {dayLabel(insights.nextReportAt)} — generated automatically, even with the
              dashboard closed.
            </p>
          </>
        )}
      </div>

      {insights !== null && insights.weeklyHistory.length > 1 && (
        <div className="glass panel" style={{ marginTop: 16 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Previous weeks
          </p>
          {insights.weeklyHistory.slice(1, 4).map((week) => (
            <div
              className="kv"
              key={week.weekStart}
              style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}
            >
              <div className="row-between" style={{ width: "100%" }}>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {weekRange(week.weekStart, week.weekEnd)}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="badge badge-neutral">{week.totalTickets} tickets</span>
                  <span className={`badge ${TREND_CLASS[week.sentimentTrend]}`}>
                    {week.sentimentScore}/100
                  </span>
                  <span className="tiny muted">{week.escalationRate}% escalated</span>
                </span>
              </div>
              <p className="tiny muted">Top complaint: {week.topComplaint ?? "none repeated"}</p>
            </div>
          ))}
        </div>
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

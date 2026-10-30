"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";

export interface OverviewData {
  business: {
    businessId: string;
    name: string;
    type: string;
    brainVersion: number;
    chunkCount: number;
  };
  counts: {
    open: number;
    total: number;
    answered: number;
    escalated: number;
    draft: number;
  };
  insights: {
    windowDays: number;
    autoAnswered: number;
    drafts: number;
    escalated: number;
    autoAnswerRate: number;
    escalationRate: number;
    citations: number;
    totalTickets: number;
    topRule: string | null;
    busiestChannel: string | null;
    sentiment: { positive: number; neutral: number; frustrated: number; distressed: number };
  };
  dots: boolean[];
  weekBars: number[];
  spark: number[];
  intents: Array<{ label: string; count: number }>;
}

function Glyph({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "clock":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8.2V12l2.6 1.7" />
        </svg>
      );
    case "alert":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5M12 16.2v.2" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="5.5" y="10.5" width="13" height="9" rx="2.6" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 20h4l10.5-10.5-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 19V9M10 19V5M15 19v-7M20 19v-4" />
        </svg>
      );
    case "trend":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 16c3-6 5-2 8-5s4-6 8-4" />
          <path d="M4 19h16" />
        </svg>
      );
    case "dots":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="5.5" cy="12" r="1.3" />
          <circle cx="12" cy="12" r="1.3" />
          <circle cx="18.5" cy="12" r="1.3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 4.5 13.6 9l4.5 1.6-4.5 1.6L12 16.7l-1.6-4.5L5.9 10.6 10.4 9 12 4.5Z" />
          <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
        </svg>
      );
    case "filter":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4.5 6.5h15l-5.8 6.7v5.6l-3.4-1.8v-3.8L4.5 6.5Z" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="11" cy="11" r="6.2" />
          <path d="m15.6 15.6 3.4 3.4" />
        </svg>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 12h15m-5-5 5 5-5 5" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "sun":
      return (
        <svg viewBox="0 0 48 48" {...common} strokeWidth={1.1}>
          <circle cx="24" cy="24" r="7.5" />
          <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2" />
        </svg>
      );
    default:
      return null;
  }
}

function sparkPath(values: number[]): string {
  if (values.length === 0) return "";
  const width = 240;
  const height = 56;
  const step = values.length === 1 ? width : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10;
      const y = Math.round((height - (Math.max(0, Math.min(100, value)) / 100) * height) * 10) / 10;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

const FACES = [
  "M8 17.5Q12 12.5 16 17.5",
  "M8 16.5Q12 13.5 16 16.5",
  "M8.5 16.5h7",
  "M8 14.5Q12 18 16 14.5",
  "M8 14Q12 19.5 16 14",
];

export function OverviewBoard({ data }: { data: OverviewData }) {
  const { business, counts, insights, dots, weekBars, spark, intents } = data;
  const [picked, setPicked] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(true);

  const base = `/dashboard?business=${business.businessId}`;
  const queueHref = `/dashboard?tab=queue&business=${business.businessId}`;
  const brainHref = `/dashboard?tab=brain&business=${business.businessId}`;
  const channelsHref = `/dashboard?tab=channels&business=${business.businessId}`;
  const maxBars = Math.max(1, ...weekBars);

  return (
    <>
      <div className="board-top">
        <section className="tile biz">
          <div className="biz-top">
            <span className="biz-mark">{business.name}</span>
            <span className="mini-pill">
              {business.type}
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m7 10 5 5 5-5" />
              </svg>
            </span>
          </div>

          <p className="biz-sub">Linked to your live queue</p>
          <p className="biz-id">
            brain v{business.brainVersion} · {business.chunkCount} chunks
          </p>

          <div className="segmented" role="tablist" aria-label="Queue or insights">
            <Link href={queueHref} data-active="true" role="tab" aria-selected="true">
              Queue
            </Link>
            <Link href={brainHref} role="tab" aria-selected="false">
              Insights
            </Link>
          </div>

          <div className="fee-strip">
            <div>
              <p className="micro">Answered this week</p>
              <p className="big-num">{insights.autoAnswered}</p>
            </div>
            <Link href={brainHref} className="coral-link">
              <span className="ci">
                <Glyph name="edit" />
              </span>
              <span>
                Edit
                <br />
                brain chunks
              </span>
            </Link>
          </div>
        </section>

        <div className="right-stack">
          <section className="tile metric-tile">
            <div className="metric-top">
              <span className="tile-ico">
                <Glyph name="clock" />
              </span>
              <span className="mini-pill">
                Weekly
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </span>
            </div>
            <p className="metric-label">Answered by the agent</p>
            <p className="big-num">{insights.autoAnswerRate}%</p>
          </section>

          <section className="tile metric-tile">
            <div className="metric-top">
              <span className="tile-ico">
                <Glyph name="alert" />
              </span>
              <span className="mini-pill">
                Weekly
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </span>
            </div>
            <p className="metric-label">Escalated to a human</p>
            <p className="big-num">{insights.escalationRate}%</p>
            <div className="metric-foot">
              <Link href={brainHref} className="coral-link">
                <span className="ci">
                  <Glyph name="trend" />
                </span>
                <span>
                  View
                  <br />
                  on chart mode
                </span>
              </Link>
            </div>
          </section>
        </div>

        <div className="right-stack">
          <div className="lock-cell">
            <div className="lock-badge">
              <Glyph name="lock" />
              Fail-safe
            </div>
          </div>
          <div className="ring-cell">
            <div className="ring" style={{ "--pct": insights.autoAnswerRate } as CSSProperties}>
              <div className="ring-inner">
                <b>{insights.autoAnswerRate}%</b>
                <span>auto-answered</span>
              </div>
            </div>
          </div>
        </div>

        <div className="right-stack">
          <section className="tile days-tile">
            <span className="tile-ico">
              <Glyph name="clock" />
            </span>
            <h3>13 Days</h3>
            <p className="micro">live triage history</p>
            <div className="dots-grid" aria-label="Ticket activity over the last thirteen days">
              {dots.map((on, index) => (
                <i key={index} className={on ? "on" : undefined} />
              ))}
            </div>
          </section>

          <section className="tile chart-tile">
            <span className="tile-ico">
              <Glyph name="chart" />
            </span>
            <div className="chart-pills">
              <span>30d</span>
              <span className="on">7d</span>
            </div>
            <div className="chart-bars">
              {weekBars.map((value, index) => (
                <i
                  key={index}
                  className={index === weekBars.length - 1 ? "on" : undefined}
                  style={{ height: `${18 + (value / maxBars) * 62}%` }}
                  title={`${value} tickets`}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="board-bottom">
        <section className="tile volume-tile">
          <div className="tile-head">
            <h2>Ticket volume</h2>
            <span className="mini-pill">
              7 days
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m7 10 5 5 5-5" />
              </svg>
            </span>
          </div>
          <div className="volume-rings" aria-hidden="true">
            <div className="vring l1">
              <span>{insights.totalTickets}</span>
            </div>
            <div className="vring l2">
              <span>{insights.autoAnswered}</span>
            </div>
            <div className="vring l3">
              <span>{insights.escalated}</span>
            </div>
            <div className="vring l4">
              <span>{insights.drafts}</span>
            </div>
          </div>
        </section>

        <section className="tile activity">
          <div className="activity-head">
            <h2>Activity manager</h2>
            <div className="activity-tools">
              <span className="tool-round">
                <Glyph name="dots" />
              </span>
              <span className="tool-round">
                <Glyph name="sparkle" />
              </span>
              <Link className="filter-pill" href={queueHref}>
                <Glyph name="filter" />
                Filters
              </Link>
            </div>
          </div>

          <div className="activity-search">
            <span className="search-round">
              <Glyph name="search" />
            </span>
            <span className="search-hint">Search in tickets ...</span>
            <div className="activity-chips">
              <Link className="activity-chip" href={queueHref}>
                All <i />
              </Link>
              <Link className="activity-chip" href={`${queueHref}&state=escalated`}>
                Escalated
                <Glyph name="x" />
              </Link>
              <Link className="activity-chip" href={`${queueHref}&state=new`}>
                New
                <Glyph name="x" />
              </Link>
            </div>
          </div>

          <div className="activity-tray">
            <div className="mini-card">
              <p className="big-num">
                {insights.totalTickets}
                <span className="unit">tickets</span>
              </p>
              <div className="mini-bars" aria-hidden="true">
                {weekBars.map((value, index) => (
                  <i
                    key={index}
                    className={index === weekBars.length - 1 ? "on" : undefined}
                    style={{ height: `${16 + (value / maxBars) * 54}px` }}
                  />
                ))}
              </div>
              <div className="mini-pager" aria-hidden="true">
                <i className="on" />
                <i />
                <i />
              </div>
            </div>

            <div className="mini-card">
              <div className="mini-card-head">
                <span>Top intents</span>
                <span className="tool-round" style={{ width: 24, height: 24 }}>
                  <Glyph name="dots" />
                </span>
              </div>
              <div className="intent-list">
                {intents.slice(0, 3).map((intent, index) => (
                  <Link className="intent-row" key={intent.label} href={brainHref}>
                    <span className="step">{index + 1}</span>
                    <b>{intent.label}</b>
                    <span className="count">{intent.count}</span>
                  </Link>
                ))}
                {intents.length === 0 && (
                  <p className="micro" style={{ paddingTop: 10 }}>
                    No repeated intents yet.
                  </p>
                )}
              </div>
            </div>

            <div className="mini-card verify-card">
              <span className="sun">
                <Glyph name="sun" />
              </span>
              <h4>Voice verification</h4>
              <p>Connect the voice line so the agent can answer a real call.</p>
              <Link className="btn-coral" href={channelsHref}>
                Enable
              </Link>
            </div>
          </div>
        </section>

        <div className="right-stack">
          <section className="tile spark-tile">
            <div className="spark-head">
              <span className="tile-ico">
                <Glyph name="trend" />
              </span>
              <span className="big-num">
                {insights.totalTickets === 0
                  ? "0%"
                  : `${Math.round(
                      (insights.sentiment.positive / Math.max(1, insights.totalTickets)) * 100,
                    )}%`}
              </span>
            </div>
            <h3 className="spark-title">Sentiment</h3>
            <p className="micro">Positive share · {insights.windowDays} days</p>
            <svg className="spark-svg" viewBox="0 0 240 56" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ec6a4b" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#ec6a4b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${sparkPath(spark)} L240 56 L0 56 Z`} fill="url(#sparkFill)" />
              <path
                d={sparkPath(spark)}
                fill="none"
                stroke="#ec6a4b"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="spark-foot">
              <span className="mini-pill coral">+{insights.citations} cited</span>
            </div>
          </section>

          {reviewOpen && (
          <section className="tile review-tile">
            <div className="review-head">
              <span className="review-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <button
                type="button"
                className="review-close"
                aria-label="Dismiss review card"
                onClick={() => setReviewOpen(false)}
              >
                <Glyph name="x" />
              </button>
            </div>
            <p className="review-eyebrow">Review rating</p>
            <p className="review-q">How is triage going today?</p>
            {picked === null ? (
              <div className="faces" role="group" aria-label="Rate this dashboard">
                {FACES.map((mouth, index) => (
                  <button
                    key={index}
                    type="button"
                    className="face"
                    aria-label={["Very bad", "Bad", "Neutral", "Good", "Very good"][index]}
                    onClick={() => setPicked(index)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
                      <path d={mouth} />
                    </svg>
                  </button>
                ))}
              </div>
            ) : (
              <p className="review-thanks" role="status">
                Thanks — noted for this demo.
              </p>
            )}
          </section>
          )}
        </div>
      </div>
    </>
  );
}

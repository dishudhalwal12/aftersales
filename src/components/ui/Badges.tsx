import type { ReactNode } from "react";

export const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  TEXT_MODAL: "Text modal",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  GMAIL: "Gmail",
  VOICE: "Voice",
};

export const RULE_COPY: Readonly<Record<string, string>> = {
  R1: "explicit request for a human",
  R2: "low confidence / no grounded source",
  R3: "distress or human judgment",
  R4: "urgency ≥ 80",
  R5: "channel is draft-only",
  R6: "grounded answer, auto-sent",
  R7: "classifier failure — failed safe",
};

export function RuleBadge({ rule }: { rule: string }) {
  return (
    <span className="badge badge-neutral mono" title={RULE_COPY[rule] ?? rule}>
      {rule}
    </span>
  );
}

export function ActionPill({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    answered: { className: "badge-sent", label: "answered" },
    draft: { className: "badge-draft", label: "draft only" },
    escalated: { className: "badge-esc", label: "escalated" },
    failed: { className: "badge-esc", label: "failed safe" },
  };
  const entry = map[status] ?? { className: "badge-neutral", label: status };
  return <span className={`badge ${entry.className}`}>{entry.label}</span>;
}

export function StatePill({ state }: { state: string }) {
  const map: Record<string, string> = {
    new: "badge-neutral",
    triaged: "badge-draft",
    replied: "badge-sent",
    escalated: "badge-esc",
    closed: "badge-neutral",
  };
  return <span className={`badge ${map[state] ?? "badge-neutral"}`}>{state}</span>;
}

export function SentimentPill({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    positive: "badge-sent",
    neutral: "badge-neutral",
    frustrated: "badge-draft",
    distressed: "badge-esc",
  };
  return <span className={`badge ${map[sentiment] ?? "badge-neutral"}`}>{sentiment}</span>;
}

export function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="badge badge-neutral">
      <span className="dot" aria-hidden="true" />
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

export function ConfidenceMeter({
  value,
  actionStatus,
}: {
  value: number;
  actionStatus: string;
}) {
  const tone = value < 50 || actionStatus === "failed" ? "meter-esc" : value < 70 ? "meter-draft" : "meter-sent";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 132 }}>
      <div className={`meter ${tone}`} style={{ flex: 1 }} role="img" aria-label={`confidence ${value} out of 100`}>
        <span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <b className="mono" style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </b>
    </div>
  );
}

export function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="detail-empty">
      <p style={{ fontWeight: 600, color: "var(--ink)" }}>{title}</p>
      <p className="tiny" style={{ maxWidth: 320 }}>
        {hint}
      </p>
    </div>
  );
}

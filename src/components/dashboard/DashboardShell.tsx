"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "../ui/Logo.tsx";
import { AiTextModal } from "./AiTextModal.tsx";
import { emitDataChanged } from "./client.ts";
import type { BusinessSummary } from "../../lib/api-types.ts";

export type TabKey = "queue" | "voice" | "brain" | "channels";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "queue", label: "Live queue" },
  { key: "voice", label: "Voice test" },
  { key: "brain", label: "Business brain & insights" },
  { key: "channels", label: "Channels" },
];

export function DashboardShell({
  businesses,
  activeBusiness,
  tab,
  user,
  providerLabel,
  degraded,
  queueCount,
  resetAction,
  signOutAction,
  children,
}: {
  businesses: BusinessSummary[];
  activeBusiness: BusinessSummary;
  tab: TabKey;
  user: { name: string | null; email: string };
  providerLabel: string;
  degraded: boolean;
  queueCount: number;
  resetAction: () => Promise<void>;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [resetPending, startReset] = useTransition();
  const router = useRouter();

  function resetDemo() {
    startReset(async () => {
      await resetAction();
      emitDataChanged();
      router.refresh();
    });
  }

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link href="/" aria-label="AfterSales AI home">
            <Logo size={26} />
          </Link>

          <form
            action=""
            onSubmit={(event) => event.preventDefault()}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <label className="sr-only" htmlFor="business-switcher">
              Active business
            </label>
            <select
              id="business-switcher"
              className="select"
              style={{ width: "auto", padding: "7px 10px", fontSize: 13 }}
              value={activeBusiness.businessId}
              onChange={(event) => {
                window.location.href = `/dashboard?tab=${tab}&business=${event.target.value}`;
              }}
            >
              {businesses.map((business) => (
                <option key={business.businessId} value={business.businessId}>
                  {business.name} · {business.businessType}
                </option>
              ))}
            </select>
          </form>

          <span className="spread" />

          <span
            className={`badge ${degraded ? "badge-draft" : "badge-sent"}`}
            title={providerLabel}
          >
            {degraded ? "offline classifier" : "model live"}
          </span>

          <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            Test my AI agent
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={resetDemo}
            disabled={resetPending}
            title="Delete only the tickets this demo created"
          >
            {resetPending ? "Resetting…" : "Reset demo"}
          </button>

          <form action={signOutAction}>
            <button className="btn btn-ghost btn-sm" type="submit" title={user.email}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      {degraded && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <p className="banner" role="status">
            <span className="dot" aria-hidden="true" style={{ marginTop: 6 }} />
            <span>
              <b>Offline retrieval classifier.</b> No LLM key is configured on this deployment, so
              answers here are extracted verbatim from the cited chunk by BM25 relevance — not
              generated. The confidence meter is a coverage score. Set <code>LLM_PROVIDER</code> and{" "}
              <code>OPENROUTER_API_KEY</code> to switch to the model path; if that call fails, the
              pipeline fails safe to R7 instead of guessing.
            </span>
          </p>
        </div>
      )}

      <main className="wrap dash">
        <nav className="side" aria-label="Dashboard panels">
          {TABS.map((entry) => (
            <Link
              key={entry.key}
              href={`/dashboard?tab=${entry.key}&business=${activeBusiness.businessId}`}
              className="side-link"
              data-active={entry.key === tab}
            >
              {entry.label}
              {entry.key === "queue" && <span className="side-count">{queueCount}</span>}
            </Link>
          ))}

          <div className="glass panel-tight" style={{ marginTop: 14, fontSize: 12 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Business
            </p>
            <p style={{ fontWeight: 620 }}>{activeBusiness.name}</p>
            <p className="muted tiny">
              brain v{activeBusiness.brainVersion} · {activeBusiness.chunkCount} chunks
            </p>
            <p className="muted tiny" style={{ marginTop: 6 }}>
              Auto-send {activeBusiness.autoSendEnabled ? "enabled" : "disabled"}
            </p>
          </div>
        </nav>

        <section>{children}</section>
      </main>

      {modalOpen && (
        <AiTextModal
          businessId={activeBusiness.businessId}
          businessName={activeBusiness.name}
          onClose={() => setModalOpen(false)}
          onAnswered={emitDataChanged}
        />
      )}
    </>
  );
}

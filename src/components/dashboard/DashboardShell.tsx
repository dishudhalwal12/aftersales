"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "../ui/Logo.tsx";
import { AiTextModal } from "./AiTextModal.tsx";
import { emitDataChanged } from "./client.ts";
import type { BusinessSummary } from "../../shared/api.ts";

export type TabKey = "queue" | "voice" | "brain" | "channels";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "queue", label: "Live queue" },
  { key: "voice", label: "Voice test" },
  { key: "brain", label: "Brain & insights" },
  { key: "channels", label: "Channels" },
];

/**
 * The shell keeps the landing page's frame around the product: the wordmark and a
 * hairline top bar, an editorial page head that names the workspace, and a numbered
 * rail whose panels are pages rather than tabs in a box.
 */
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
          <Link href="/" prefetch={false} className="topbar-brand" aria-label="AfterSales AI home">
            <Logo />
          </Link>

          <form
            className="topbar-biz"
            action=""
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="sr-only" htmlFor="business-switcher">
              Active business
            </label>
            <select
              id="business-switcher"
              className="select biz-switch"
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

          <div className="topbar-actions">
            <span
              className={`topbar-state ${degraded ? "is-offline" : "is-live"}`}
              title={providerLabel}
            >
              <span className="dot dot-live" aria-hidden="true" />
              {degraded ? "offline classifier" : "model live"}
            </span>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setModalOpen(true)}
            >
              Test my AI agent
            </button>

            <button
              type="button"
              className="btn btn-sm"
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
        </div>
      </header>

      {degraded && (
        <div className="wrap" style={{ paddingTop: 14 }}>
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

      <div className="wrap">
        <section className="page-head">
          <div>
            <p className="eyebrow">
              Workspace · {activeBusiness.businessType}
            </p>
            <h1 className="page-title">{activeBusiness.name}</h1>
            <p className="page-lede">
              One queue for WhatsApp, Instagram, Gmail and voice. Every reply carries the rule it was
              routed by and the chunk it was grounded in.
            </p>
          </div>

          <div className="page-meta">
            <div>
              <b>v{activeBusiness.brainVersion}</b>
              <span>brain version</span>
            </div>
            <div>
              <b>{activeBusiness.chunkCount}</b>
              <span>cited chunks</span>
            </div>
            <div>
              <b>{activeBusiness.autoSendEnabled ? "On" : "Off"}</b>
              <span>auto-send</span>
            </div>
          </div>
        </section>
      </div>

      <main className="wrap dash">
        <nav className="side" aria-label="Dashboard panels">
          <p className="side-label">Panels</p>

          {TABS.map((entry, index) => (
            <Link
              key={entry.key}
              href={`/dashboard?tab=${entry.key}&business=${activeBusiness.businessId}`}
              className="side-link"
              data-active={entry.key === tab}
              aria-current={entry.key === tab ? "page" : undefined}
            >
              <span className="side-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{entry.label}</span>
              {entry.key === "queue" && <span className="side-count">{queueCount}</span>}
            </Link>
          ))}

          <p className="rail-note">
            Every answer is grounded in brain v{activeBusiness.brainVersion}. Below confidence 50 it
            escalates instead of sending — with the rule and the reason attached.
          </p>
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

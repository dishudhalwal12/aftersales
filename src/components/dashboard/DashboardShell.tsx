"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiTextModal } from "./AiTextModal.tsx";
import { emitDataChanged } from "./client.ts";
import type { BusinessSummary } from "../../shared/api.ts";

export type TabKey = "overview" | "queue" | "voice" | "brain" | "channels";

const NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "queue", label: "Live queue" },
  { key: "voice", label: "Voice test" },
  { key: "brain", label: "Business brain & insights" },
  { key: "channels", label: "Channels" },
];

function Icon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "menu":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 8h16M4 13h16M4 18h10" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 5v14M5 12h14" />
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
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="4" y="5.5" width="16" height="14" rx="3" />
          <path d="M8 3.8v3M16 3.8v3M4 10h16" />
        </svg>
      );
    case "mic":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="9" y="3.5" width="6" height="10" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
        </svg>
      );
    case "queue":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
    case "brain":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M9.5 5.5A3.5 3.5 0 0 0 6 9v.4a3.2 3.2 0 0 0-1 5.9V17a3 3 0 0 0 3 3h2.2V5.5H9.5ZM14.5 5.5A3.5 3.5 0 0 1 18 9v.4a3.2 3.2 0 0 1 1 5.9V17a3 3 0 0 1-3 3h-2.2V5.5h.7Z" />
        </svg>
      );
    case "channels":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 8.5h10.5L19 12l-3.5 3.5H5z" />
          <path d="M19 15.5H8.5L5 12l3.5-3.5H19z" />
        </svg>
      );
    case "voice":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="9" y="3.5" width="6" height="10" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
        </svg>
      );
    case "reset":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4.5 9a8 8 0 1 1-.4 6.5" />
          <path d="M4.5 4.5V9H9" />
        </svg>
      );
    default:
      return null;
  }
}

function initials(name: string | null, email: string): string {
  const source = (name ?? email.split("@")[0] ?? "AS").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function DashboardShell({
  businesses,
  activeBusiness,
  tab,
  user,
  providerLabel,
  degraded,
  queueCount,
  today,
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
  today: { day: string; weekday: string; month: string };
  resetAction: () => Promise<void>;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resetPending, startReset] = useTransition();
  const router = useRouter();

  const href = (key: TabKey) =>
    key === "overview"
      ? `/dashboard?business=${activeBusiness.businessId}`
      : `/dashboard?tab=${key}&business=${activeBusiness.businessId}`;

  function resetDemo() {
    startReset(async () => {
      await resetAction();
      emitDataChanged();
      router.refresh();
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(
      `/dashboard?tab=queue&business=${activeBusiness.businessId}${
        trimmed === "" ? "" : `&q=${encodeURIComponent(trimmed)}`
      }`,
    );
  }

  return (
    <div className="shell">
      <div className="app">
        <header className="appbar">
          <div className="appbar-left">
            <button
              type="button"
              className="icon-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="menu" />
            </button>
            <Link href="/dashboard" className="brand-mark" aria-label="AfterSales command dashboard">
              AS
            </Link>
            <div className="brand-txt" aria-hidden="true">
              <b>AfterSales</b>
              <span>Command dashboard</span>
            </div>
          </div>

          <span className="spacer" />

          <button
            type="button"
            className="icon-btn sm"
            aria-label="Ask the agent anything"
            onClick={() => setModalOpen(true)}
          >
            <Icon name="plus" />
          </button>

          <div className="user-chip">
            <span className="avatar">{initials(user.name, user.email)}</span>
            <div title={user.email}>
              <b>{user.name ?? "Business owner"}</b>
              <span>Business owner</span>
            </div>
          </div>

          <form className="search-box" onSubmit={submitSearch} role="search">
            <button type="submit" className="icon-btn sm" aria-label="Search tickets">
              <Icon name="search" />
            </button>
            <label className="sr-only" htmlFor="global-search">
              Search tickets
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="Start searching here ..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>

          {menuOpen && (
            <div className="menu-pop" role="menu" aria-label="Dashboard sections">
              <p className="menu-label">Workspace</p>
              {NAV.map((entry) => (
                <Link
                  key={entry.key}
                  href={href(entry.key)}
                  className="menu-item"
                  data-active={entry.key === tab}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon name={entry.key === "overview" ? "grid" : entry.key} />
                  {entry.label}
                  {entry.key === "queue" && <span className="count">{queueCount}</span>}
                </Link>
              ))}

              <div className="menu-sep" />

              <p className="menu-label">Business</p>
              {businesses.map((business) => (
                <Link
                  key={business.businessId}
                  href={`/dashboard?${tab === "overview" ? "" : `tab=${tab}&`}business=${business.businessId}`}
                  className="menu-item"
                  data-active={business.businessId === activeBusiness.businessId}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon name="queue" />
                  <span className="truncate">{business.name}</span>
                  <span className="count">{business.businessType}</span>
                </Link>
              ))}

              <div className="menu-sep" />

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setModalOpen(true);
                }}
              >
                <Icon name="plus" />
                Test my AI agent
              </button>

              <button type="button" className="menu-item" onClick={resetDemo} disabled={resetPending}>
                <Icon name="reset" />
                {resetPending ? "Resetting…" : "Reset demo data"}
              </button>

              <form action={signOutAction}>
                <button className="menu-item" type="submit">
                  <Icon name="arrow" />
                  Sign out
                </button>
              </form>

              <p className="menu-user">{user.email}</p>
              <p className="menu-user">
                {degraded ? "Offline retrieval classifier" : providerLabel}
              </p>
            </div>
          )}
        </header>

        <section className="hero">
          <div className="date-chip" aria-label={`${today.weekday} ${today.day} ${today.month}`}>
            <b>{today.day}</b>
            <span className="vr" aria-hidden="true" />
            <span>
              {today.weekday},
              <br />
              {today.month}
            </span>
          </div>

          <Link className="hero-pill" href={href("queue")}>
            Show my queue
            <Icon name="arrow" />
          </Link>

          <Link
            className="icon-btn cal-dot"
            href={href("brain")}
            aria-label="Weekly insights"
            style={{ width: 56, height: 56 }}
          >
            <Icon name="calendar" />
          </Link>

          <div className="hero-ask">
            <h1>Hey, need help? 👋</h1>
            <button type="button" className="ask-line" onClick={() => setModalOpen(true)}>
              <span className="caret" aria-hidden="true" />
              Ask me anything!
            </button>
          </div>

          <Link className="icon-btn mic" href={href("voice")} aria-label="Voice test">
            <Icon name="mic" />
          </Link>
        </section>

        <div className="board">
          <aside className="rail" aria-label="Quick actions">
            <div className="rail-bar">
              <button type="button" onClick={() => setModalOpen(true)} aria-label="Test my AI agent">
                <Icon name="plus" />
              </button>
            </div>
            <Link
              className="rail-round"
              href={href("overview")}
              data-active={tab === "overview"}
              aria-label="Dashboard overview"
            >
              <Icon name="grid" />
            </Link>
          </aside>

          {tab === "overview" ? (
            children
          ) : (
            <section className="panel-screen">
              <div className="panel-screen-top">
                <Link className="back-pill" href={href("overview")}>
                  <Icon name="arrow" />
                  Overview
                </Link>
                <span className="tiny muted">{activeBusiness.name}</span>
              </div>
              {children}
            </section>
          )}
        </div>
      </div>

      {modalOpen && (
        <AiTextModal
          businessId={activeBusiness.businessId}
          businessName={activeBusiness.name}
          onClose={() => setModalOpen(false)}
          onAnswered={emitDataChanged}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, emitDataChanged, timeAgo, useDataChanged } from "./client.ts";
import { DecisionSheetPanel, LayaHeadline, decisionSheetReasonText } from "./DecisionSheetPanel.tsx";
import type { TicketDetailResponse, TicketListResponse, TicketSummary } from "../../shared/api.ts";
import {
  ActionPill,
  ChannelBadge,
  ConfidenceMeter,
  Empty,
  RULE_COPY,
  RuleBadge,
  SentimentPill,
  StatePill,
} from "../ui/Badges.tsx";

const FILTERS = ["all", "new", "triaged", "escalated", "replied", "closed"] as const;
type Filter = (typeof FILTERS)[number];

/** The stored reason a ticket has no decision sheet, in words a judge can read. */
function decisionSheetReason(detail: TicketDetailResponse | null, ticketId: string): string | null {
  if (detail === null || detail.ticket.ticketId !== ticketId) return null;
  const event = detail.events.find((entry) => entry.eventType === "DECISION_SHEET_UNAVAILABLE");
  if (!event || typeof event.payload !== "object" || event.payload === null) return null;
  const reason = (event.payload as { reason?: unknown }).reason;
  return typeof reason === "string" ? decisionSheetReasonText(reason) : null;
}

export function LiveQueuePanel({ businessId }: { businessId: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetailResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const response = await apiFetch<TicketListResponse>(
        `/api/businesses/${businessId}/tickets?state=${filter}&limit=100`,
      );
      setTickets(response.tickets);
      setError(null);
      setSelectedId((current) => current ?? response.tickets[0]?.ticketId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not load tickets");
      setTickets([]);
    }
  }, [businessId, filter]);

  useEffect(() => {
    setTickets(null);
    setSelectedId(null);
    setDetail(null);
    void loadList();
  }, [loadList]);

  useDataChanged(() => {
    void loadList();
  });

  const loadDetail = useCallback(
    async (ticketId: string) => {
      try {
        const response = await apiFetch<TicketDetailResponse>(
          `/api/businesses/${businessId}/tickets?ticketId=${ticketId}`,
        );
        setDetail(response);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "could not load the ticket");
      }
    },
    [businessId],
  );

  useEffect(() => {
    if (selectedId !== null) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function act(ticketId: string, action: "approve_draft" | "resolve" | "close") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${businessId}/tickets`, {
        method: "PATCH",
        body: JSON.stringify({ ticketId, action }),
      });
      await loadDetail(ticketId);
      await loadList();
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "action failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = detail?.ticket ?? tickets?.find((ticket) => ticket.ticketId === selectedId) ?? null;

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>Live queue</h2>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            One queue for WhatsApp, Instagram, Gmail, voice and the text tester. Newest first.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void loadList()}>
          Refresh
        </button>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="filters">
        {FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            className="chip"
            data-active={entry === filter}
            onClick={() => setFilter(entry)}
          >
            {entry === "all" ? "All" : entry}
          </button>
        ))}
      </div>

      <div className="queue-grid">
        <div className="glass panel-tight queue-list scroll-y">
          {tickets === null && (
            <div className="stack">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="skeleton" style={{ height: 62 }} />
              ))}
            </div>
          )}

          {tickets !== null && tickets.length === 0 && (
            <Empty
              title="No tickets in this filter"
              hint="Fire a webhook from the Channels panel or ask something in Test my AI agent."
            />
          )}

          {tickets?.map((ticket) => (
            <button
              key={ticket.ticketId}
              type="button"
              className="ticket-row"
              data-active={ticket.ticketId === selectedId}
              onClick={() => setSelectedId(ticket.ticketId)}
            >
              <div className="row-between">
                <span className="row" style={{ gap: 6 }}>
                  <ChannelBadge channel={ticket.channel} />
                  <StatePill state={ticket.state} />
                </span>
                <span className="tiny muted">{timeAgo(ticket.createdAt)}</span>
              </div>
              <p style={{ fontWeight: 600, fontSize: 13.5 }}>{ticket.customerName}</p>
              <p className="muted tiny clamp-2">{ticket.customerQuery}</p>
              <div className="ticket-meta">
                <RuleBadge rule={ticket.routingRuleHit} />
                <ActionPill status={ticket.actionStatus} />
                <span className="mono">conf {ticket.confidenceScore}</span>
                <SentimentPill sentiment={ticket.sentiment} />
                <LayaHeadline sheet={ticket.decisionSheet} />
              </div>
            </button>
          ))}
        </div>

        <div className="glass panel" style={{ minHeight: 320 }}>
          {selected === null ? (
            <Empty title="Select a ticket" hint="The decision trail, the cited chunks and the actions live here." />
          ) : (
            <div className="fade-in">
              <div className="row-between" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <ChannelBadge channel={selected.channel} />
                    <StatePill state={selected.state} />
                    <span className="tiny muted">{timeAgo(selected.createdAt)}</span>
                  </div>
                  <h3 style={{ fontSize: 18, marginTop: 8 }}>{selected.customerName}</h3>
                  <p className="tiny muted">{selected.customerHandle}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <RuleBadge rule={selected.routingRuleHit} />
                  <p className="tiny muted" style={{ marginTop: 4, maxWidth: 160 }}>
                    {RULE_COPY[selected.routingRuleHit] ?? ""}
                  </p>
                </div>
              </div>

              <div className="glass panel-tight" style={{ marginTop: 14, background: "#fff" }}>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  Customer message
                </p>
                <p style={{ fontSize: 13.5 }}>{selected.customerQuery}</p>
              </div>

              <div className="grid-2" style={{ marginTop: 14, gap: 16 }}>
                <div>
                  <p className="tiny muted">Confidence</p>
                  <ConfidenceMeter value={selected.confidenceScore} actionStatus={selected.actionStatus} />
                </div>
                <div>
                  <p className="tiny muted">Urgency · {selected.urgencyScore}/100</p>
                  <div className={`meter ${selected.urgencyScore >= 80 ? "meter-esc" : "meter-draft"}`}>
                    <span style={{ width: `${Math.max(2, selected.urgencyScore)}%` }} />
                  </div>
                </div>
              </div>

              <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                <ActionPill status={selected.actionStatus} />
                <SentimentPill sentiment={selected.sentiment} />
                <span className="badge badge-neutral">{selected.specialistAssigned}</span>
                <span className="badge badge-neutral mono">{selected.intent}</span>
              </div>

              <DecisionSheetPanel
                sheet={selected.decisionSheet}
                unavailableReason={decisionSheetReason(detail, selected.ticketId)}
                classifierUrgency={selected.urgencyScore}
                classifierSentiment={selected.sentiment}
              />

              <p className="eyebrow" style={{ marginTop: 16, marginBottom: 6 }}>
                {selected.actionStatus === "answered" ? "Reply sent" : "Agent draft (not sent)"}
              </p>
              <p style={{ fontSize: 13.5 }}>{selected.aiDraftOrReply}</p>

              <p className="eyebrow" style={{ marginTop: 16, marginBottom: 6 }}>
                Cited chunks ({selected.citedChunkIds.length})
              </p>
              {selected.citedChunkIds.length === 0 ? (
                <p className="tiny muted">Nothing cited — this ticket may not be auto-sent (R2).</p>
              ) : (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {selected.citedChunkIds.map((id) => (
                    <span key={id} className="badge badge-neutral mono">
                      {id}
                    </span>
                  ))}
                </div>
              )}

              <div className="row" style={{ marginTop: 18, gap: 8, flexWrap: "wrap" }}>
                {selected.actionStatus === "draft" && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void act(selected.ticketId, "approve_draft")}
                  >
                    Approve &amp; send draft
                  </button>
                )}
                {selected.state === "escalated" && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void act(selected.ticketId, "resolve")}
                  >
                    Resolve escalation
                  </button>
                )}
                {selected.state !== "closed" && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => void act(selected.ticketId, "close")}
                  >
                    Close ticket
                  </button>
                )}
                <span className="tiny muted" style={{ alignSelf: "center" }}>
                  A human closes escalations — the agent has no path out of them.
                </span>
              </div>

              <p className="eyebrow" style={{ marginTop: 20, marginBottom: 6 }}>
                Event trail
              </p>
              {detail?.ticket.ticketId === selected.ticketId ? (
                <div className="timeline">
                  {detail.events.map((event) => (
                    <div className="tl-item" key={event.id}>
                      <span className="tl-dot" aria-hidden="true" />
                      <div>
                        <div className="row-between">
                          <span className="tl-type">{event.eventType}</span>
                          <span className="tiny muted">{timeAgo(event.createdAt)}</span>
                        </div>
                        <p className="tiny muted mono" style={{ wordBreak: "break-word" }}>
                          {JSON.stringify(event.payload)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="skeleton" style={{ height: 90 }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

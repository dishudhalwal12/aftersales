"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, emitDataChanged } from "./client.ts";
import { IntegrationsPanel } from "./IntegrationsPanel.tsx";
import type { ChannelStateResponse, WebhookResponse } from "../../shared/api.ts";

const PROVIDERS = [
  { key: "whatsapp", label: "WhatsApp", note: "Inbound webhook + simulated inbox" },
  { key: "instagram", label: "Instagram DM", note: "Connect a Page or IG account under Connected accounts" },
  { key: "gmail", label: "Gmail", note: "Connect the owner mailbox under Connected accounts" },
] as const;

const STATUS_COPY: Readonly<Record<string, { className: string; label: string }>> = {
  CONNECTED: { className: "badge-sent", label: "connected" },
  TEST_MODE: { className: "badge-draft", label: "test mode" },
  DRAFT_ONLY: { className: "badge-draft", label: "draft only" },
  UNAVAILABLE: { className: "badge-neutral", label: "unavailable" },
};

export function ChannelsPanel({
  businessId,
  sarvamConfigured,
  virtualNumber,
  baileysConfigured,
}: {
  businessId: string;
  sarvamConfigured: boolean;
  virtualNumber: string | null;
  baileysConfigured: boolean;
}) {
  const [states, setStates] = useState<Record<string, ChannelStateResponse>>({});
  const [provider, setProvider] = useState<string>("whatsapp");
  const [message, setMessage] = useState("What is the price of the Pro Plan and does it include WhatsApp invoicing?");
  const [messageId, setMessageId] = useState(() => `sim-${Date.now()}`);
  const [first, setFirst] = useState<WebhookResponse | null>(null);
  const [second, setSecond] = useState<WebhookResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const entries = await Promise.all(
        PROVIDERS.map(async (entry) => {
          const state = await apiFetch<ChannelStateResponse>(
            `/api/channels/webhook/${entry.key}?businessId=${businessId}`,
          );
          return [entry.key, state] as const;
        }),
      );
      setStates(Object.fromEntries(entries));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not load channel state");
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fire(): Promise<WebhookResponse> {
    return apiFetch<WebhookResponse>(`/api/channels/webhook/${provider}`, {
      method: "POST",
      body: JSON.stringify({
        businessId,
        externalMessageId: messageId,
        customerName: "Priya (simulated)",
        customerHandle: "+919810000199",
        query: message,
      }),
    });
  }

  async function fireOnce() {
    setBusy(true);
    setError(null);
    setSecond(null);
    try {
      setFirst(await fire());
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "webhook failed");
    } finally {
      setBusy(false);
    }
  }

  async function fireTwice() {
    setBusy(true);
    setError(null);
    try {
      setFirst(await fire());
      setSecond(await fire());
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "webhook failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-head">
        <div>
          <p className="eyebrow">04 — Channels</p>
          <h2>Channels</h2>
          <p className="panel-lede">
            Truthful connection state per channel. A channel can be simulated before it is connected —
            the label says which one it is.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="grid-2">
        {PROVIDERS.map((entry) => {
          const state = states[entry.key];
          const copy = STATUS_COPY[state?.status ?? "UNAVAILABLE"] ?? STATUS_COPY["UNAVAILABLE"];
          return (
            <div className="glass channel-card" key={entry.key}>
              <div className="channel-title">
                <b style={{ fontSize: 14 }}>{entry.label}</b>
                <span className={`badge ${copy?.className}`}>{copy?.label}</span>
              </div>
              <p className="tiny muted">{state?.transport ?? entry.note}</p>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="badge badge-neutral">
                  auto-send {state?.autoSend === true ? "on" : "off"}
                </span>
                {state?.autoSend === false && (
                  <span className="badge badge-draft">R5 draft-only</span>
                )}
              </div>
            </div>
          );
        })}

        <div className="glass channel-card">
          <div className="channel-title">
            <b style={{ fontSize: 14 }}>Sarvam voice</b>
            <span className={`badge ${sarvamConfigured ? "badge-sent" : "badge-draft"}`}>
              {sarvamConfigured ? "connected" : "test mode"}
            </span>
          </div>
          <p className="tiny muted">
            One rented number {virtualNumber ?? "(none configured)"} · per-call context variables.
          </p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="badge badge-neutral">tools: 1 endpoint</span>
            <span className="badge badge-neutral">Hinglish</span>
          </div>
        </div>
      </div>

      <IntegrationsPanel businessId={businessId} baileysConfigured={baileysConfigured} />

      <div className="glass panel" style={{ marginTop: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Simulate an inbound webhook
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {PROVIDERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="chip"
              data-active={provider === entry.key}
              aria-pressed={provider === entry.key}
              onClick={() => setProvider(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <label className="field" style={{ marginBottom: 10 }}>
          <span>Customer message</span>
          <textarea
            className="textarea"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 260px" }}>
            <span>externalMessageId (the idempotency key)</span>
            <input
              className="input mono"
              value={messageId}
              onChange={(event) => setMessageId(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setMessageId(`sim-${Date.now()}`);
              setFirst(null);
              setSecond(null);
            }}
          >
            New message
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void fireOnce()}>
            Deliver once
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void fireTwice()}>
            Deliver twice
          </button>
        </div>

        {(first !== null || second !== null) && (
          <div className="grid-2 fade-in" style={{ marginTop: 14 }}>
            {[first, second].map((result, index) => (
              <div className="glass panel-tight" key={index} style={{ background: "#fff" }}>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  Delivery {index + 1}
                </p>
                {result === null ? (
                  <p className="tiny muted">Not sent.</p>
                ) : (
                  <>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <span className={`badge ${result.duplicate ? "badge-neutral" : "badge-sent"}`}>
                        {result.duplicate ? "duplicate — ignored" : "ticket created"}
                      </span>
                      <span className="badge badge-neutral mono">{result.routingRuleHit}</span>
                      <span className="badge badge-neutral">{result.actionStatus}</span>
                    </div>
                    <p className="tiny muted mono" style={{ marginTop: 6 }}>
                      {result.ticketId}
                    </p>
                    <p className="tiny" style={{ marginTop: 6 }}>
                      confidence {result.confidenceScore} · {result.specialist}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {first !== null && second !== null && (
          <p className="banner banner-ok" style={{ marginTop: 12 }}>
            <span>
              Two deliveries, {first.ticketId === second.ticketId ? "one ticket" : "two tickets"} —{" "}
              {first.ticketId === second.ticketId
                ? "the (businessId, externalMessageId) key absorbed the replay."
                : "the ids differed, so both were processed."}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

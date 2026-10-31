"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./client.ts";
import {
  OAUTH_CALLBACK_MESSAGE_TYPE,
  type EmailStatusResponse,
  type OAuthCallbackMessage,
  type WhatsappConnectionResponse,
} from "../../shared/api.ts";

const POLL_INTERVAL_MS = 2500;
const POLL_DEADLINE_MS = 5 * 60_000;

type PendingAuth = "gmail" | "whatsapp";
type Badge = { className: string; label: string };

function describeError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "the request failed";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function openAuthWindow(url: string): boolean {
  // Keep the opener reference: the backend callback page reports its result
  // with window.opener.postMessage(...). Only URLs built by our own connect
  // endpoint are opened here, so the popup is not untrusted content.
  const popup = window.open(url, "_blank", "width=560,height=760");
  if (!popup) {
    window.location.assign(url);
    return false;
  }
  return true;
}

function readOAuthCallbackMessage(value: unknown): OAuthCallbackMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record["type"] !== OAUTH_CALLBACK_MESSAGE_TYPE) return null;
  if (record["integration"] !== "email") {
    return null;
  }
  if (typeof record["status"] !== "string") return null;

  return {
    type: OAUTH_CALLBACK_MESSAGE_TYPE,
    integration: record["integration"],
    status: record["status"],
    businessId: typeof record["businessId"] === "string" ? record["businessId"] : null,
    error: typeof record["error"] === "string" ? record["error"] : null,
    message: typeof record["message"] === "string" ? record["message"] : null,
    emailAddress: typeof record["emailAddress"] === "string" ? record["emailAddress"] : null,
  };
}

function emailBadge(email: EmailStatusResponse | null): Badge {
  if (!email) return { className: "badge-neutral", label: "checking" };
  if (email.connected) return { className: "badge-sent", label: "connected" };
  if (email.status === "error") return { className: "badge-esc", label: "needs attention" };
  if (!email.configured || !email.encryptionConfigured || !email.oauthStateConfigured) {
    return { className: "badge-neutral", label: "unavailable" };
  }
  return { className: "badge-draft", label: "not connected" };
}

function whatsappBadge(
  configured: boolean,
  connection: WhatsappConnectionResponse | null,
): Badge {
  if (!configured) return { className: "badge-neutral", label: "unavailable" };
  if (!connection) return { className: "badge-neutral", label: "not connected" };
  if (connection.status === "connected") return { className: "badge-sent", label: "connected" };
  if (connection.status === "qr") return { className: "badge-draft", label: "waiting for scan" };
  if (connection.status === "connecting") return { className: "badge-draft", label: "connecting" };
  if (connection.lastError) return { className: "badge-esc", label: "error" };
  return { className: "badge-neutral", label: "disconnected" };
}

export function IntegrationsPanel({
  businessId,
  baileysConfigured,
}: {
  businessId: string;
  baileysConfigured: boolean;
}) {
  const [email, setEmail] = useState<EmailStatusResponse | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappConnectionResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<PendingAuth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fetchEmail = useCallback(
    () => apiFetch<EmailStatusResponse>(`/api/social/email/status?businessId=${encodeURIComponent(businessId)}`),
    [businessId],
  );

  const fetchWhatsapp = useCallback(async () => {
    try {
      return await apiFetch<WhatsappConnectionResponse>(
        `/api/channels/whatsapp/connection?businessId=${encodeURIComponent(businessId)}`,
      );
    } catch (caught) {
      // 404 means this business never linked a device; that is a normal state.
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    }
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [emailResult, whatsappResult] = await Promise.allSettled([
        fetchEmail(),
        fetchWhatsapp(),
      ]);
      if (cancelled) return;

      if (emailResult.status === "fulfilled") setEmail(emailResult.value);
      else setError(describeError(emailResult.reason));

      if (whatsappResult.status === "fulfilled") setWhatsapp(whatsappResult.value);
      else setError(describeError(whatsappResult.reason));
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchEmail, fetchWhatsapp]);

  // The OAuth popup posts its outcome here as soon as the backend callback
  // finishes, so an error stops the wait immediately instead of after the
  // poll deadline. Origin and business are both checked before acting.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const message = readOAuthCallbackMessage(event.data);
      if (!message) return;
      if (message.businessId && message.businessId !== businessId) return;

      setWaiting(null);

      if (message.integration === "email") {
        if (message.status === "error") {
          setError(
            message.message ?? "Gmail connection failed. Start the connection again to retry.",
          );
        } else {
          setError(null);
          setNote(
            message.emailAddress ? `Gmail connected as ${message.emailAddress}.` : "Gmail connected.",
          );
        }
        void fetchEmail()
          .then(setEmail)
          .catch((caught: unknown) => setError(describeError(caught)));
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [businessId, fetchEmail]);

  useEffect(() => {
    if (waiting === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_DEADLINE_MS;

    async function tick() {
      if (cancelled) return;
      try {
        if (waiting === "gmail") {
          const next = await fetchEmail();
          if (cancelled) return;
          setEmail(next);
          if (next.connected) {
            setWaiting(null);
            setNote(`Gmail connected as ${next.emailAddress ?? "your account"}.`);
            return;
          }
          if (next.status === "error") {
            setWaiting(null);
            setError(
              next.lastError ?? "Gmail connection failed. Start the connection again to retry.",
            );
            return;
          }
        } else {
          const next = await fetchWhatsapp();
          if (cancelled) return;
          setWhatsapp(next);
          if (next === null) {
            setWaiting(null);
            return;
          }
          if (next.status === "connected") {
            setWaiting(null);
            setNote(`WhatsApp connected${next.phoneNumber ? ` as ${next.phoneNumber}` : ""}.`);
            return;
          }
          if (next.status === "logged_out" || next.status === "disconnected") {
            setWaiting(null);
            return;
          }
        }
      } catch (caught) {
        if (cancelled) return;
        setWaiting(null);
        setError(describeError(caught));
        return;
      }

      if (Date.now() >= deadline) {
        setWaiting(null);
        setNote("Still waiting for the provider. Refresh once the approval is finished.");
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting, fetchEmail, fetchWhatsapp]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await action();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function connectEmail() {
    void run("email-connect", async () => {
      const result = await apiFetch<{ authorizationUrl: string }>("/api/social/email/connect", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      });
      if (openAuthWindow(result.authorizationUrl)) {
        setWaiting("gmail");
        setNote("Finish the Google approval in the new tab; this card updates on its own.");
      }
    });
  }

  function disconnectEmail() {
    void run("email-disconnect", async () => {
      await apiFetch("/api/social/email/disconnect", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      });
      setEmail(await fetchEmail());
      setWaiting(null);
      setNote("Gmail disconnected and its stored tokens were removed.");
    });
  }

  function connectWhatsapp() {
    void run("whatsapp-connect", async () => {
      const next = await apiFetch<WhatsappConnectionResponse>("/api/channels/whatsapp/connect", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      });
      setWhatsapp(next);
      if (next.status !== "connected") {
        setWaiting("whatsapp");
        setNote("Scan the QR code in WhatsApp → Linked devices. The code refreshes automatically.");
      }
    });
  }

  function disconnectWhatsapp() {
    void run("whatsapp-disconnect", async () => {
      const next = await apiFetch<WhatsappConnectionResponse>("/api/channels/whatsapp/disconnect", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      });
      setWhatsapp(next);
      setWaiting(null);
      setNote("WhatsApp disconnected and the local session was logged out.");
    });
  }

  const emailState = emailBadge(email);
  const whatsappState = whatsappBadge(baileysConfigured, whatsapp);
  const emailReady = Boolean(
    email?.configured && email.encryptionConfigured && email.oauthStateConfigured,
  );

  return (
    <div className="glass panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Connected accounts</p>
          <h2>Account connections</h2>
          <p className="panel-lede">
            OAuth and QR linking are completed by the backend. These labels only show what the
            provider confirmed — nothing is pre-marked as connected.
          </p>
        </div>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {note !== null && (
        <p className="banner banner-ok" role="status" style={{ marginBottom: 12 }}>
          {note}
        </p>
      )}

      <div className="grid-2">
        <div className="glass channel-card" style={{ background: "#fff" }}>
          <div className="channel-title">
            <b style={{ fontSize: 14 }}>Gmail</b>
            <span className={`badge ${emailState.className}`}>{emailState.label}</span>
          </div>
          <p className="tiny muted">
            {email?.connected
              ? `${email.emailAddress ?? "Owner mailbox"} · connected ${formatWhen(email.connectedAt)}`
              : !email
                ? "Reading status…"
                : !email.configured
                  ? "EMAIL_GMAIL_CLIENT_ID / SECRET are not set on this deployment."
                  : !email.encryptionConfigured || !email.oauthStateConfigured
                    ? "Set INTEGRATION_ENCRYPTION_KEY and INTEGRATION_STATE_SECRET to enable connections."
                    : `Provider ${email.provider} · OAuth approved per business.`}
          </p>
          {email?.lastError && !email.connected && (
            <p className="tiny" style={{ color: "var(--danger, #b42318)" }}>
              {email.lastError}
            </p>
          )}
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {emailReady && !email?.connected && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy !== null}
                onClick={connectEmail}
              >
                {busy === "email-connect" ? "Opening Google…" : "Connect Gmail"}
              </button>
            )}
            {email?.connected && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy !== null}
                onClick={disconnectEmail}
              >
                {busy === "email-disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
            {waiting === "gmail" && <span className="badge badge-draft">waiting for Google</span>}
            <span className="badge badge-neutral">scope gmail.modify</span>
          </div>
        </div>

        <div className="glass channel-card" style={{ background: "#fff" }}>
          <div className="channel-title">
            <b style={{ fontSize: 14 }}>WhatsApp</b>
            <span className={`badge ${whatsappState.className}`}>{whatsappState.label}</span>
          </div>
          <p className="tiny muted">
            {!baileysConfigured
              ? "BAILEYS_SERVICE_URL / BAILEYS_SERVICE_SECRET are not set, so the local service is unavailable."
              : whatsapp?.status === "connected"
                ? `${whatsapp.phoneNumber ?? "Linked device"} · connected ${formatWhen(whatsapp.connectedAt)}`
                : whatsapp?.status === "qr"
                  ? "Waiting for the linked-device scan."
                  : whatsapp?.status === "connecting"
                    ? "The local service is opening a socket."
                    : "Links a real WhatsApp Web session through the local Baileys service."}
          </p>
          {whatsapp?.lastError && whatsapp.status !== "connected" && (
            <p className="tiny" style={{ color: "var(--danger, #b42318)" }}>
              {whatsapp.lastError}
            </p>
          )}
          {whatsapp?.status === "qr" && whatsapp.qr && (
            <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {/* The QR is transient pairing material rendered by the local service. */}
              <img
                src={whatsapp.qr}
                alt="WhatsApp linked-device QR code"
                width={148}
                height={148}
                style={{ borderRadius: 12, border: "1px solid var(--line, #e5e7eb)", background: "#fff" }}
              />
              <p className="tiny muted" style={{ flex: "1 1 180px" }}>
                Open WhatsApp → Linked devices → Link a device, then scan. The code refreshes
                automatically until the phone confirms.
              </p>
            </div>
          )}
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {baileysConfigured && whatsapp?.status !== "connected" && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy !== null}
                onClick={connectWhatsapp}
              >
                {busy === "whatsapp-connect" ? "Opening session…" : "Connect WhatsApp"}
              </button>
            )}
            {baileysConfigured && whatsapp !== null && whatsapp.status !== "logged_out" && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy !== null}
                onClick={disconnectWhatsapp}
              >
                {busy === "whatsapp-disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
            {waiting === "whatsapp" && <span className="badge badge-draft">waiting for scan</span>}
            <span className="badge badge-neutral">no credentials reach the browser</span>
          </div>
        </div>

        {/* Instagram DM & comments — disabled / to be launched */}
        <div className="glass channel-card" style={{ background: "#fff", opacity: 0.75 }}>
          <div className="channel-title">
            <b style={{ fontSize: 14 }}>Instagram DM &amp; comments</b>
            <span className="badge badge-neutral">to be launched</span>
          </div>
          <p className="tiny muted">
            Instagram DM &amp; comments integration will be launched soon. Professional account connection will be available once live.
          </p>
          <div className="glass panel-tight" style={{ background: "#fff" }}>
            <div className="row-between">
              <b style={{ fontSize: 13 }}>Professional account</b>
              <span className="badge badge-neutral">coming soon</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              Direct messaging and comment auto-replies via Instagram Login.
            </p>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled
              style={{ cursor: "not-allowed", opacity: 0.6 }}
            >
              Coming soon
            </button>
            <span className="badge badge-neutral">Instagram Login · messages + comments</span>
          </div>
        </div>
      </div>
    </div>
  );
}

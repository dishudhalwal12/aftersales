"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, emitDataChanged } from "./client.ts";
import type { VoiceAgentContextResponse } from "../../shared/api.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface ContextForm {
  name: string;
  businessType: string;
  description: string;
  productsServices: string;
  hours: string;
  faqs: string;
  returnPolicy: string;
  escalationEmail: string;
  escalationPhone: string;
  agentTone: string;
  businessAddress: string;
  weeklyHolidays: string[];
  languagesText: string;
  appointmentPolicy: string;
  agentInstructions: string;
  virtualNumber: string;
  agentId: string;
  isActive: boolean;
}

function toForm(response: VoiceAgentContextResponse): ContextForm {
  return {
    name: response.businessName,
    businessType: response.businessType,
    description: response.businessDescription,
    productsServices: response.productsServices,
    hours: response.openingHours,
    faqs: response.faqs,
    returnPolicy: response.returnPolicy,
    escalationEmail: response.escalationEmail,
    escalationPhone: response.escalationPhone,
    agentTone: response.agentTone,
    businessAddress: response.businessAddress,
    weeklyHolidays: [...response.weeklyHolidays],
    languagesText: response.supportedLanguages.join(", "),
    appointmentPolicy: response.appointmentPolicy,
    agentInstructions: response.agentInstructions,
    virtualNumber: response.virtualNumber ?? "",
    agentId: response.agentId ?? "",
    isActive: response.isActive,
  };
}

export function VoiceContextPanel({ businessId }: { businessId: string }) {
  const [saved, setSaved] = useState<VoiceAgentContextResponse | null>(null);
  const [form, setForm] = useState<ContextForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await apiFetch<VoiceAgentContextResponse>(
        `/api/businesses/${businessId}/voice-agent/context`,
      );
      setSaved(response);
      setForm(toForm(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not load the voice context");
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof ContextForm>(key: K, value: ContextForm[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function toggleHoliday(day: string) {
    setForm((current) => {
      if (current === null) return current;
      const has = current.weeklyHolidays.includes(day);
      return {
        ...current,
        weeklyHolidays: has
          ? current.weeklyHolidays.filter((entry) => entry !== day)
          : [...current.weeklyHolidays, day],
      };
    });
  }

  async function save() {
    if (form === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch<VoiceAgentContextResponse>(
        `/api/businesses/${businessId}/voice-agent/context`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            businessType: form.businessType,
            description: form.description,
            productsServices: form.productsServices,
            hours: form.hours,
            faqs: form.faqs,
            returnPolicy: form.returnPolicy,
            escalationEmail: form.escalationEmail,
            escalationPhone: form.escalationPhone,
            agentTone: form.agentTone,
            businessAddress: form.businessAddress,
            weeklyHolidays: form.weeklyHolidays,
            supportedLanguages: form.languagesText,
            appointmentPolicy: form.appointmentPolicy,
            agentInstructions: form.agentInstructions,
            virtualNumber: form.virtualNumber,
            agentId: form.agentId,
            isActive: form.isActive,
          }),
        },
      );
      setSaved(response);
      setForm(toForm(response));
      setNotice(
        response.recompiled === true
          ? `Saved — the brain was rebuilt as v${response.brainVersion} (${response.chunkCount} chunks).`
          : `Saved — call context updated; brain v${response.brainVersion} unchanged.`,
      );
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not save the voice context");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>What the phone agent knows</h2>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Saved per business and loaded when a call starts. A call is matched by agent id or
            virtual number — never by a business id sent from the call.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {saved !== null && (
            <span className={`badge ${saved.isActive ? "badge-sent" : "badge-draft"}`}>
              {saved.isActive ? "active" : "inactive"}
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={() => void load()}>
            Reload
          </button>
        </div>
      </div>

      {error !== null && (
        <p className="banner banner-danger" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="banner banner-ok" role="status" style={{ marginBottom: 12 }}>
          {notice}
        </p>
      )}

      {form === null ? (
        <p className="tiny muted">Loading the saved context…</p>
      ) : (
        <>
          <div className="grid-2">
            <label className="field">
              <span>Business name</span>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Business type</span>
              <input
                className="input"
                value={form.businessType}
                onChange={(event) => setField("businessType", event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>What the business does</span>
            <textarea
              className="textarea"
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Services, plans and prices</span>
            <textarea
              className="textarea"
              value={form.productsServices}
              onChange={(event) => setField("productsServices", event.target.value)}
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Address the agent can read out</span>
              <textarea
                className="textarea"
                value={form.businessAddress}
                onChange={(event) => setField("businessAddress", event.target.value)}
                placeholder="Shop 4, MI Road, Jaipur 302001"
              />
            </label>
            <label className="field">
              <span>Opening hours</span>
              <textarea
                className="textarea"
                value={form.hours}
                onChange={(event) => setField("hours", event.target.value)}
              />
            </label>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <span>Weekly holidays</span>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className="chip"
                  data-active={form.weeklyHolidays.includes(day)}
                  onClick={() => toggleHoliday(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            <label className="field">
              <span>Languages the agent may use (comma separated)</span>
              <input
                className="input"
                value={form.languagesText}
                onChange={(event) => setField("languagesText", event.target.value)}
                placeholder="Hindi, English"
              />
            </label>
            <label className="field">
              <span>Agent tone</span>
              <input
                className="input"
                value={form.agentTone}
                onChange={(event) => setField("agentTone", event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Appointment / booking policy</span>
            <textarea
              className="textarea"
              value={form.appointmentPolicy}
              onChange={(event) => setField("appointmentPolicy", event.target.value)}
              placeholder="Appointments can be rescheduled free of charge up to 4 hours before the slot."
            />
          </label>

          <label className="field">
            <span>FAQs</span>
            <textarea
              className="textarea"
              value={form.faqs}
              onChange={(event) => setField("faqs", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Refund / return policy</span>
            <textarea
              className="textarea"
              value={form.returnPolicy}
              onChange={(event) => setField("returnPolicy", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Agent instructions</span>
            <textarea
              className="textarea"
              value={form.agentInstructions}
              onChange={(event) => setField("agentInstructions", event.target.value)}
              placeholder="Never promise a discount. If the caller is in pain or angry, offer a human call-back."
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Escalation phone (E.164)</span>
              <input
                className="input mono"
                value={form.escalationPhone}
                onChange={(event) => setField("escalationPhone", event.target.value)}
                placeholder="+919812345678"
              />
            </label>
            <label className="field">
              <span>Escalation email</span>
              <input
                className="input mono"
                value={form.escalationEmail}
                onChange={(event) => setField("escalationEmail", event.target.value)}
              />
            </label>
          </div>

          <hr className="hairline" style={{ margin: "16px 0" }} />

          <div className="grid-2">
            <label className="field">
              <span>Virtual number mapped to this business</span>
              <input
                className="input mono"
                value={form.virtualNumber}
                onChange={(event) => setField("virtualNumber", event.target.value)}
                placeholder="+918047123456 (blank = use session fallback)"
              />
            </label>
            <label className="field">
              <span>Sarvam agent id mapped to this business</span>
              <input
                className="input mono"
                value={form.agentId}
                onChange={(event) => setField("agentId", event.target.value)}
                placeholder="optional"
              />
            </label>
          </div>

          <div className="row-between" style={{ flexWrap: "wrap", gap: 10 }}>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setField("isActive", event.target.checked)}
              />
              Answer calls with this context
            </label>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save voice context"}
            </button>
          </div>

          {saved !== null && (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              brain v{saved.brainVersion} · {saved.chunkCount} chunks ·{" "}
              {saved.updatedAt === null ? "no call context saved yet" : `context updated ${saved.updatedAt}`}
              {saved.virtualNumber === null && saved.agentId === null
                ? " · no number or agent mapped, so the on-start tool falls back to a session or PIN"
                : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, emitDataChanged } from "./client.ts";
import {
  VOICE_CUSTOMIZATION_TYPES,
  type VoiceAvailabilityConfig,
  type VoiceAvailabilityWindow,
  type VoiceCustomizationConfigMap,
  type VoiceCustomizationType,
  type VoiceCustomizationsResponse,
} from "../../shared/api.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];
const DETAIL_OPTIONS = ["name", "phone", "preferred_date", "preferred_time"];

type Draft = VoiceCustomizationsResponse["customizations"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankWindow(): VoiceAvailabilityWindow {
  return { start: "10:00", end: "14:00" };
}

function WindowRows({
  windows,
  disabled,
  onChange,
}: {
  windows: VoiceAvailabilityWindow[];
  disabled: boolean;
  onChange: (next: VoiceAvailabilityWindow[]) => void;
}) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {windows.map((window, index) => (
        <span key={index} className="row" style={{ gap: 4, alignItems: "center" }}>
          <input
            className="input mono"
            style={{ width: 78 }}
            type="time"
            value={window.start}
            disabled={disabled}
            aria-label="Window start"
            onChange={(event) => {
              const next = windows.map((entry, at) =>
                at === index ? { ...entry, start: event.target.value } : entry,
              );
              onChange(next);
            }}
          />
          <span className="tiny muted">to</span>
          <input
            className="input mono"
            style={{ width: 78 }}
            type="time"
            value={window.end}
            disabled={disabled}
            aria-label="Window end"
            onChange={(event) => {
              const next = windows.map((entry, at) =>
                at === index ? { ...entry, end: event.target.value } : entry,
              );
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => onChange(windows.filter((_, at) => at !== index))}
          >
            ×
          </button>
        </span>
      ))}
      {windows.length < 3 && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={disabled}
          onClick={() => onChange([...windows, blankWindow()])}
        >
          + window
        </button>
      )}
    </div>
  );
}

export function VoiceCustomizationPanel({ businessId }: { businessId: string }) {
  const [saved, setSaved] = useState<VoiceCustomizationsResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await apiFetch<VoiceCustomizationsResponse>(
        `/api/businesses/${businessId}/voice-agent/customizations`,
      );
      setSaved(response);
      setDraft(response.customizations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not load the customizations");
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends VoiceCustomizationType>(
    type: K,
    config: Partial<VoiceCustomizationConfigMap[K]>,
  ) {
    setDraft((current) => {
      if (current === null) return current;
      const entry = current[type];
      return {
        ...current,
        [type]: {
          ...entry,
          configuration: { ...entry.configuration, ...config } as VoiceCustomizationConfigMap[K],
        },
      } as Draft;
    });
  }

  function setEnabled(type: VoiceCustomizationType, isEnabled: boolean) {
    setDraft((current) =>
      current === null ? current : { ...current, [type]: { ...current[type], isEnabled } },
    );
  }

  function patchAvailability(config: Partial<VoiceAvailabilityConfig>) {
    patch("availability", config);
  }

  async function save() {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const customizations: Record<string, { isEnabled: boolean; configuration: unknown }> = {};
      for (const type of VOICE_CUSTOMIZATION_TYPES) {
        customizations[type] = {
          isEnabled: draft[type].isEnabled,
          configuration: draft[type].configuration,
        };
      }
      const response = await apiFetch<VoiceCustomizationsResponse>(
        `/api/businesses/${businessId}/voice-agent/customizations`,
        { method: "PUT", body: JSON.stringify({ customizations }) },
      );
      setSaved(response);
      setDraft(response.customizations);
      setNotice(
        "Saved — the next call uses this schedule and these rules. Date-specific changes beat the weekly schedule.",
      );
      emitDataChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not save the customizations");
    } finally {
      setBusy(false);
    }
  }

  if (draft === null) {
    return (
      <div className="glass panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Availability and call rules</h2>
        </div>
        {error !== null ? (
          <p className="banner banner-danger" role="alert">
            {error}
          </p>
        ) : (
          <p className="tiny muted">Loading the saved customizations…</p>
        )}
      </div>
    );
  }

  const availability = draft.availability.configuration;
  const appointment = draft.appointment_booking.configuration;
  const cancellation = draft.cancellation_policy.configuration;
  const rescheduling = draft.rescheduling_policy.configuration;
  const callback = draft.callback_requests.configuration;
  const urgent = draft.urgent_call_handling.configuration;
  const instructions = draft.business_specific_instructions.configuration;

  return (
    <div className="glass panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>Availability and call rules</h2>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Loaded at call start and re-checked by the request tool. A date-specific change beats
            the weekly schedule, and a temporary closure beats both. Business profile, FAQs and
            languages live in the panel above.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => void load()}>
            Reload
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save rules"}
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

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3>Weekly availability</h3>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.availability.isEnabled}
              onChange={(event) => setEnabled("availability", event.target.checked)}
            />
            Use this schedule on calls
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Time zone</span>
            <input
              className="input mono"
              list="voice-timezones"
              value={availability.timezone}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ timezone: event.target.value })}
            />
            <datalist id="voice-timezones">
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Appointment duration (minutes)</span>
            <input
              className="input mono"
              type="number"
              min={5}
              max={480}
              value={availability.slotMinutes}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ slotMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Buffer between appointments (minutes)</span>
            <input
              className="input mono"
              type="number"
              min={0}
              max={240}
              value={availability.bufferMinutes}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ bufferMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Maximum appointments per slot</span>
            <input
              className="input mono"
              type="number"
              min={1}
              max={100}
              value={availability.maxPerSlot}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ maxPerSlot: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Minimum advance booking (hours)</span>
            <input
              className="input mono"
              type="number"
              min={0}
              max={720}
              value={availability.minAdvanceHours}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ minAdvanceHours: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>How far ahead requests may be taken (days)</span>
            <input
              className="input mono"
              type="number"
              min={1}
              max={365}
              value={availability.maxFutureDays}
              disabled={!draft.availability.isEnabled}
              onChange={(event) => patchAvailability({ maxFutureDays: Number(event.target.value) })}
            />
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          {availability.weekly.map((day) => (
            <div key={day.day} style={{ padding: "8px 0", borderTop: "1px solid var(--line, #e5e5e5)" }}>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <strong style={{ width: 92 }}>{day.day}</strong>
                <label className="row" style={{ gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!day.closed}
                    disabled={!draft.availability.isEnabled}
                    onChange={(event) =>
                      patchAvailability({
                        weekly: availability.weekly.map((entry) =>
                          entry.day === day.day
                            ? {
                                ...entry,
                                closed: !event.target.checked,
                                windows:
                                  !event.target.checked
                                    ? []
                                    : entry.windows.length > 0
                                      ? entry.windows
                                      : [blankWindow()],
                              }
                            : entry,
                        ),
                      })
                    }
                  />
                  open
                </label>
                {!day.closed ? (
                  <WindowRows
                    windows={day.windows}
                    disabled={!draft.availability.isEnabled}
                    onChange={(next) =>
                      patchAvailability({
                        weekly: availability.weekly.map((entry) =>
                          entry.day === day.day ? { ...entry, windows: next } : entry,
                        ),
                      })
                    }
                  />
                ) : (
                  <span className="tiny muted">closed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3>Date-specific changes</h3>
            <p className="tiny muted">These override the weekly schedule for exactly that date.</p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!draft.availability.isEnabled || availability.dateOverrides.length >= 60}
            onClick={() =>
              patchAvailability({
                dateOverrides: [
                  ...availability.dateOverrides,
                  { date: todayIso(), closed: true, windows: [], note: "" },
                ],
              })
            }
          >
            + date override
          </button>
        </div>

        {availability.dateOverrides.length === 0 && (
          <p className="tiny muted">No date-specific changes — the weekly schedule applies.</p>
        )}

        {availability.dateOverrides.map((override, index) => (
          <div key={index} className="grid-2" style={{ alignItems: "end", marginTop: 8 }}>
            <label className="field">
              <span>Date</span>
              <input
                className="input mono"
                type="date"
                value={override.date}
                disabled={!draft.availability.isEnabled}
                onChange={(event) =>
                  patchAvailability({
                    dateOverrides: availability.dateOverrides.map((entry, at) =>
                      at === index ? { ...entry, date: event.target.value } : entry,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Note for the agent</span>
              <input
                className="input"
                value={override.note}
                disabled={!draft.availability.isEnabled}
                placeholder="Dr. Mehta at a conference"
                onChange={(event) =>
                  patchAvailability({
                    dateOverrides: availability.dateOverrides.map((entry, at) =>
                      at === index ? { ...entry, note: event.target.value } : entry,
                    ),
                  })
                }
              />
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={override.closed}
                disabled={!draft.availability.isEnabled}
                onChange={(event) =>
                  patchAvailability({
                    dateOverrides: availability.dateOverrides.map((entry, at) =>
                      at === index
                        ? {
                            ...entry,
                            closed: event.target.checked,
                            windows:
                              event.target.checked
                                ? []
                                : entry.windows.length > 0
                                  ? entry.windows
                                  : [blankWindow()],
                          }
                        : entry,
                    ),
                  })
                }
              />
              unavailable this day
            </label>
            <div className="row-between" style={{ gap: 8, marginBottom: 10 }}>
              {!override.closed ? (
                <WindowRows
                  windows={override.windows}
                  disabled={!draft.availability.isEnabled}
                  onChange={(next) =>
                    patchAvailability({
                      dateOverrides: availability.dateOverrides.map((entry, at) =>
                        at === index ? { ...entry, windows: next } : entry,
                      ),
                    })
                  }
                />
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn btn-sm"
                disabled={!draft.availability.isEnabled}
                onClick={() =>
                  patchAvailability({
                    dateOverrides: availability.dateOverrides.filter((_, at) => at !== index),
                  })
                }
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3>Temporary unavailability</h3>
            <p className="tiny muted">A closure range removes availability for every day it covers.</p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!draft.availability.isEnabled || availability.temporaryClosures.length >= 20}
            onClick={() =>
              patchAvailability({
                temporaryClosures: [
                  ...availability.temporaryClosures,
                  { from: todayIso(), to: todayIso(), reason: "" },
                ],
              })
            }
          >
            + closure
          </button>
        </div>

        {availability.temporaryClosures.map((closure, index) => (
          <div key={index} className="grid-2" style={{ alignItems: "end", marginTop: 8 }}>
            <label className="field">
              <span>From</span>
              <input
                className="input mono"
                type="date"
                value={closure.from}
                onChange={(event) =>
                  patchAvailability({
                    temporaryClosures: availability.temporaryClosures.map((entry, at) =>
                      at === index ? { ...entry, from: event.target.value } : entry,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>To (inclusive)</span>
              <input
                className="input mono"
                type="date"
                value={closure.to}
                onChange={(event) =>
                  patchAvailability({
                    temporaryClosures: availability.temporaryClosures.map((entry, at) =>
                      at === index ? { ...entry, to: event.target.value } : entry,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Reason the agent may mention</span>
              <input
                className="input"
                value={closure.reason}
                placeholder="Doctor on leave"
                onChange={(event) =>
                  patchAvailability({
                    temporaryClosures: availability.temporaryClosures.map((entry, at) =>
                      at === index ? { ...entry, reason: event.target.value } : entry,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginBottom: 10, justifySelf: "start" }}
              onClick={() =>
                patchAvailability({
                  temporaryClosures: availability.temporaryClosures.filter((_, at) => at !== index),
                })
              }
            >
              remove
            </button>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3>Appointment requests</h3>
            <p className="tiny muted">
              There is no calendar integration in this deployment, so the agent can only take a
              request and say it is pending. It never confirms a slot.
            </p>
          </div>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.appointment_booking.isEnabled}
              onChange={(event) => setEnabled("appointment_booking", event.target.checked)}
            />
            Accept appointment requests
          </label>
        </div>

        <label className="field">
          <span>Booking rules</span>
          <textarea
            className="textarea"
            value={appointment.bookingRules}
            disabled={!draft.appointment_booking.isEnabled}
            placeholder="New patients are seen only in the morning. Appointments are confirmed by the clinic, not at the time of the call."
            onChange={(event) => patch("appointment_booking", { bookingRules: event.target.value })}
          />
        </label>
        <label className="field">
          <span>When no slot is available</span>
          <textarea
            className="textarea"
            value={appointment.noSlotBehavior}
            disabled={!draft.appointment_booking.isEnabled}
            onChange={(event) => patch("appointment_booking", { noSlotBehavior: event.target.value })}
          />
        </label>
        <div className="field">
          <span>What the agent must collect</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {DETAIL_OPTIONS.map((detail) => (
              <button
                key={detail}
                type="button"
                className="chip"
                data-active={appointment.requiredDetails.includes(detail)}
                disabled={!draft.appointment_booking.isEnabled}
                onClick={() =>
                  patch("appointment_booking", {
                    requiredDetails: appointment.requiredDetails.includes(detail)
                      ? appointment.requiredDetails.filter((entry) => entry !== detail)
                      : [...appointment.requiredDetails, detail],
                  })
                }
              >
                {detail.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3>Cancellation policy</h3>
        <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={draft.cancellation_policy.isEnabled}
            onChange={(event) => setEnabled("cancellation_policy", event.target.checked)}
          />
          Use this policy on calls
        </label>
        <label className="field">
          <span>What the agent may say</span>
          <textarea
            className="textarea"
            value={cancellation.policyText}
            disabled={!draft.cancellation_policy.isEnabled}
            placeholder="Cancellations are free up to 4 hours before the appointment."
            onChange={(event) => patch("cancellation_policy", { policyText: event.target.value })}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Cutoff (hours before the slot)</span>
            <input
              className="input mono"
              type="number"
              min={0}
              max={720}
              value={cancellation.cutoffHours}
              disabled={!draft.cancellation_policy.isEnabled}
              onChange={(event) =>
                patch("cancellation_policy", { cutoffHours: Number(event.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>Fee note</span>
            <input
              className="input"
              value={cancellation.feeNote}
              disabled={!draft.cancellation_policy.isEnabled}
              placeholder="Late cancellations may be charged."
              onChange={(event) => patch("cancellation_policy", { feeNote: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3>Rescheduling policy</h3>
        <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={draft.rescheduling_policy.isEnabled}
            onChange={(event) => setEnabled("rescheduling_policy", event.target.checked)}
          />
          Use this policy on calls
        </label>
        <label className="field">
          <span>What the agent may say</span>
          <textarea
            className="textarea"
            value={rescheduling.policyText}
            disabled={!draft.rescheduling_policy.isEnabled}
            placeholder="Rescheduling is free once up to 4 hours before the appointment."
            onChange={(event) => patch("rescheduling_policy", { policyText: event.target.value })}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Cutoff (hours before the slot)</span>
            <input
              className="input mono"
              type="number"
              min={0}
              max={720}
              value={rescheduling.cutoffHours}
              disabled={!draft.rescheduling_policy.isEnabled}
              onChange={(event) =>
                patch("rescheduling_policy", { cutoffHours: Number(event.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>Fee note</span>
            <input
              className="input"
              value={rescheduling.feeNote}
              disabled={!draft.rescheduling_policy.isEnabled}
              placeholder=""
              onChange={(event) => patch("rescheduling_policy", { feeNote: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3>Callback requests</h3>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.callback_requests.isEnabled}
              onChange={(event) => setEnabled("callback_requests", event.target.checked)}
            />
            Accept callback requests
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Instructions</span>
            <textarea
              className="textarea"
              value={callback.instructions}
              disabled={!draft.callback_requests.isEnabled}
              placeholder="Ask what the call is about and offer a callback from the clinic."
              onChange={(event) => patch("callback_requests", { instructions: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Response window the agent may promise</span>
            <input
              className="input"
              value={callback.responseWindow}
              disabled={!draft.callback_requests.isEnabled}
              onChange={(event) => patch("callback_requests", { responseWindow: event.target.value })}
            />
          </label>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={callback.collectPhone}
            disabled={!draft.callback_requests.isEnabled}
            onChange={(event) => patch("callback_requests", { collectPhone: event.target.checked })}
          />
          Always collect a phone number
        </label>
      </section>

      <section style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3>Urgent calls</h3>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.urgent_call_handling.isEnabled}
              onChange={(event) => setEnabled("urgent_call_handling", event.target.checked)}
            />
            Use these instructions
          </label>
        </div>
        <label className="field">
          <span>How urgent calls are handled</span>
          <textarea
            className="textarea"
            value={urgent.instructions}
            disabled={!draft.urgent_call_handling.isEnabled}
            placeholder="If the caller says it is urgent, take their number and flag it for the front desk."
            onChange={(event) => patch("urgent_call_handling", { instructions: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Emergency instructions</span>
          <textarea
            className="textarea"
            value={urgent.emergencyInstructions}
            disabled={!draft.urgent_call_handling.isEnabled}
            onChange={(event) =>
              patch("urgent_call_handling", { emergencyInstructions: event.target.value })
            }
          />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Transfer number (optional, E.164)</span>
            <input
              className="input mono"
              value={urgent.transferNumber ?? ""}
              disabled={!draft.urgent_call_handling.isEnabled}
              placeholder="+911412345678"
              onChange={(event) =>
                patch("urgent_call_handling", {
                  transferNumber: event.target.value.trim().length === 0 ? null : event.target.value,
                })
              }
            />
          </label>
          <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={urgent.transferEnabled}
              disabled={!draft.urgent_call_handling.isEnabled}
              onChange={(event) =>
                patch("urgent_call_handling", { transferEnabled: event.target.checked })
              }
            />
            Allow the platform to transfer urgent calls
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 8 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3>Business-specific instructions</h3>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.business_specific_instructions.isEnabled}
              onChange={(event) =>
                setEnabled("business_specific_instructions", event.target.checked)
              }
            />
            Use these instructions
          </label>
        </div>
        <label className="field">
          <span>Anything else the agent must follow</span>
          <textarea
            className="textarea"
            value={instructions.instructions}
            disabled={!draft.business_specific_instructions.isEnabled}
            placeholder="Never discuss prices over the phone. Always mention the parking entrance."
            onChange={(event) =>
              patch("business_specific_instructions", { instructions: event.target.value })
            }
          />
        </label>
        <p className="tiny muted">
          Safety rules are always enforced regardless of the settings above: the agent never
          diagnoses, never prescribes, and sends emergencies to local emergency services.
        </p>
      </section>

      <div className="row-between" style={{ flexWrap: "wrap", gap: 10 }}>
        <p className="tiny muted" style={{ margin: 0 }}>
          {saved === null
            ? ""
            : `Last saved ${Object.values(saved.customizations)
                .map((entry) => entry.updatedAt)
                .filter((value): value is string => value !== null)
                .sort()
                .at(-1) ?? "never"}`}
        </p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save availability and rules"}
        </button>
      </div>
    </div>
  );
}

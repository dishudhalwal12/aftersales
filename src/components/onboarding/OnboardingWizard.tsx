"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../dashboard/client.ts";
import type { BusinessFacts } from "../../lib/types.ts";

interface CreatedBusiness {
  businessId: string;
  name: string;
  brainVersion: number;
  chunkCount: number;
}

const BUSINESS_TYPES = ["SaaS", "E-Commerce", "Healthcare Clinic", "Restaurant", "Other"] as const;

const CHANNELS = [
  ["WhatsApp", "test mode", "Inbound webhook accepted; replies held until you flip it to connected."],
  ["Instagram DM", "draft only", "Drafts only — Meta app scope is not granted on a fresh deployment."],
  ["Gmail", "test mode", "Simulated mailbox until OAuth credentials are added."],
  ["Sarvam voice", "test mode", "A session and PIN are real; the telephone leg needs Sarvam keys."],
] as const;

const EMPTY: BusinessFacts = {
  name: "",
  businessType: "SaaS",
  description: "",
  productsServices: "",
  hours: "",
  returnPolicy: "",
  faqs: "",
  escalationEmail: "",
  escalationPhone: "",
  agentTone: "Warm, concise, and helpful",
  rawMarkdownUpload: "",
};

const STEP_TITLES = [
  "Core identity & tone",
  "Products, pricing, policies & FAQs",
  "Escalation rules & contact",
  "Channel connections",
];

export function OnboardingWizard({
  presets,
}: {
  presets: ReadonlyArray<{ label: string; facts: BusinessFacts }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [facts, setFacts] = useState<BusinessFacts>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const set = <K extends keyof BusinessFacts>(key: K, value: BusinessFacts[K]) => {
    setFacts((current) => ({ ...current, [key]: value }));
  };

  const stepError = useMemo(() => {
    if (step === 0) {
      if (facts.name.trim().length < 2) return "Give the business a name.";
      if (facts.description.trim().length < 10) return "One or two sentences about what you do.";
    }
    if (step === 1) {
      if (facts.productsServices.trim().length < 10) return "Add at least one product or service with its price.";
      if (facts.hours.trim().length < 4) return "Add your opening hours.";
      if (facts.returnPolicy.trim().length < 6) return "Add a refund, return or reschedule policy.";
      if (facts.faqs.trim().length < 6) return "Add at least one FAQ.";
    }
    if (step === 2) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(facts.escalationEmail)) return "A valid escalation email is required.";
      if (facts.escalationPhone.trim().length < 8) return "A reachable escalation phone number is required.";
    }
    return null;
  }, [step, facts]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<CreatedBusiness>("/api/businesses", {
        method: "POST",
        body: JSON.stringify(facts),
      });
      router.push(`/dashboard?tab=queue&business=${created.businessId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not save the business");
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <div className="wizard-steps">
        {STEP_TITLES.map((title, index) => (
          <button
            key={title}
            type="button"
            className="wizard-step"
            data-active={index === step}
            data-done={index < step}
            onClick={() => setStep(index)}
          >
            <span className="step-badge">{index < step ? "✓" : index + 1}</span>
            <span>{title}</span>
          </button>
        ))}

        <div className="glass panel-tight" style={{ marginTop: 12, fontSize: 12 }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Need a shortcut?
          </p>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="btn btn-sm"
              style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }}
              onClick={() => {
                setFacts(preset.facts);
                setStep(0);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass panel">
        <p className="eyebrow">Step {step + 1} of 4</p>
        <h2 style={{ fontSize: 22, marginTop: 4, marginBottom: 16 }}>{STEP_TITLES[step]}</h2>

        {step === 0 && (
          <div className="stack">
            <div className="grid-2">
              <label className="field">
                <span>Business name</span>
                <input
                  className="input"
                  value={facts.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="CloudPulse CRM"
                />
              </label>
              <label className="field">
                <span>Business type</span>
                <select
                  className="select"
                  value={facts.businessType}
                  onChange={(event) => set("businessType", event.target.value)}
                >
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>What the business does</span>
              <textarea
                className="textarea"
                value={facts.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Inventory and GST billing software for retail shops."
              />
            </label>
            <label className="field">
              <span>Agent tone</span>
              <input
                className="input"
                value={facts.agentTone}
                onChange={(event) => set("agentTone", event.target.value)}
                placeholder="Warm, concise, and helpful"
              />
              <small>This is the register the agent writes in, on every channel.</small>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <label className="field">
              <span>Products, services &amp; prices</span>
              <textarea
                className="textarea"
                value={facts.productsServices}
                onChange={(event) => set("productsServices", event.target.value)}
                placeholder="Starter Plan: ₹499 per month for one user. Pro Plan: ₹1,499 per month for five users, including WhatsApp invoicing."
              />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Opening hours</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 72 }}
                  value={facts.hours}
                  onChange={(event) => set("hours", event.target.value)}
                  placeholder="Monday to Saturday, 9:00 AM to 7:00 PM IST."
                />
              </label>
              <label className="field">
                <span>Refund / return / reschedule policy</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 72 }}
                  value={facts.returnPolicy}
                  onChange={(event) => set("returnPolicy", event.target.value)}
                  placeholder="Full refund within 7 days if fewer than 10 invoices were generated."
                />
              </label>
            </div>
            <label className="field">
              <span>FAQs</span>
              <textarea
                className="textarea"
                value={facts.faqs}
                onChange={(event) => set("faqs", event.target.value)}
                placeholder="Q: How do I export GSTR-1? A: Go to Reports > GST > Export JSON."
              />
            </label>

            <div className="field">
              <span>Or upload an existing knowledge file (.md)</span>
              <input
                className="input"
                type="file"
                accept=".md,.markdown,.txt"
                style={{ padding: 8 }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  set("rawMarkdownUpload", text.slice(0, 20000));
                  setUploadName(`${file.name} · ${text.length} characters attached`);
                }}
              />
              <small>
                {uploadName ??
                  "The upload becomes an extra section of business_brain.md — it is chunked and cited like everything else."}
              </small>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <p className="muted" style={{ fontSize: 13 }}>
              Escalation is not a setting the model chooses. Rules R1–R4 fire before any send: an
              explicit request for a human, confidence below 50, distress, or urgency ≥ 80.
            </p>
            <div className="grid-2">
              <label className="field">
                <span>Escalation email</span>
                <input
                  className="input"
                  value={facts.escalationEmail}
                  onChange={(event) => set("escalationEmail", event.target.value)}
                  placeholder="founder@cloudpulse.in"
                />
              </label>
              <label className="field">
                <span>Escalation phone</span>
                <input
                  className="input"
                  value={facts.escalationPhone}
                  onChange={(event) => set("escalationPhone", event.target.value)}
                  placeholder="+919876543210"
                />
              </label>
            </div>
            <div className="banner">
              <span>
                These two values become a citable chunk too, so the agent can tell a customer how to
                reach a human without inventing a number.
              </span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            {CHANNELS.map(([name, status, note]) => (
              <div className="glass panel-tight" key={name} style={{ background: "#fff" }}>
                <div className="row-between">
                  <b style={{ fontSize: 14 }}>{name}</b>
                  <span className="badge badge-draft">{status}</span>
                </div>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  {note}
                </p>
              </div>
            ))}
            <p className="tiny muted">
              Saving compiles business_brain.md, derives its citable chunks and takes you to the queue.
              Nothing is claimed as connected that is not connected.
            </p>
          </div>
        )}

        {error !== null && (
          <p className="banner banner-danger" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        {stepError !== null && step < 3 && (
          <p className="tiny muted" style={{ marginTop: 12 }}>
            {stepError}
          </p>
        )}

        <div className="row-between" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={stepError !== null}
              onClick={() => setStep((current) => Math.min(3, current + 1))}
            >
              Continue
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "Compiling brain…" : "Save & open dashboard"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

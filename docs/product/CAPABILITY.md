# CAPABILITY — PS 2.5 Omnichannel Support Agent

- **Capability name:** One agent-run support inbox across WhatsApp, Instagram, Gmail and one voice line, with a beep-and-bridge human escalation.
- **Source:** SPHINX '26 problem statement 2.5 (AI Agent for Automated Customer Support and Ticket Triage) + the Gate 1/Gate 2 capability contract confirmed in session.
- **Primary actor:** the single small-business owner — the only authenticated principal.
- **Outcome after ship:** repetitive inbound is resolved without the owner, urgent cases reach the owner inside one ring, and no case is silently missed.
- **Success signal:** a seeded 50-contact run where every urgent contact reaches the owner (`escalation` fired) and every non-urgent contact resolves without owner input.

> **Status:** implementation contract, not yet frozen. Every value marked `[AQ-n]` is an assumption, indexed in OPEN QUESTIONS. Nothing here is implemented.

---

## CAPABILITY

A single small-business owner — the only party in the system who ever authenticates — gets one agent-run inbox across WhatsApp, Instagram, Gmail and one Airtel voice line. Every inbound contact is classified for intent, urgency, confidence and sentiment; the repetitive ones are answered from the business's own seeded knowledge base (`business_brain.md`); the sensitive or uncertain ones beep the owner onto the same live call rather than being handed off, guessed at, or dropped. The owner's only interface is one dashboard and one laptop headset. The outcome that changes is the PS 2.5 pair: repetitive volume stops consuming the workday, and urgent cases stop being missed.

**Product intent (user-visible promise).** The agent never guesses on a customer. When it is unsure, it beeps a human into the room — on the same call, in the same second, with the line still open.

---

## CONSTRAINTS

Frozen at Gate 2. Restated one line each; full rationale was accepted in session.

**Fixed policy.**

- **F1** One Airtel number is the only voice identity — no second line, no forwarded handset.
- **F2** Escalation = `beep.wav` → mute the AI → bridge laptop mic + speaker onto the same live call. Never a transfer, never a re-dial, never a second number.
- **F3** The end customer never authenticates on any channel. The business owner is the only authenticated principal.
- **F4** Voice is Hindi/English Hinglish, code-mixed within one utterance. Text (WhatsApp / Gmail / Instagram) is English only. Not user-configurable.
- **F5** Baileys is an unofficial WhatsApp Web client; the ToS/ban risk is declared in README, deck and demo, never hidden.
- **F6** Counts are frozen: 4 channels, 6 MCP tools, 4 dashboard panels, 2 Inngest jobs.
- **F7** Voice runtime is local: Pipecat + Laya router + Kokoro TTS. IBM Watson is dropped and appears in no artifact.
- **F8** An escalation never drops the call — the line stays up through beep-and-bridge.
- **F9** Sensitive/human-flagged cases are never auto-sent; the agent drafts and waits, or beeps on voice.
- **F10** Every artifact carries **Team 41** + PS 2.5 verbatim — never a team name.
- **F11** All code authored 14:00 Oct 30 → 12:00 Oct 31; first commit inside the window; no pre-built 2.5 module.

**Architecture preference (revisable under pressure).**

- **A1** One repo, one language, one deploy target; no microservices, no k8s, no second datastore.
- **A2** The 6 MCP tools are the agent's only action surface — one narrow verb each, no free-form shell.
- **A3** Inngest is the only async path; everything else is request/response.
- **A4** Baileys sits behind its own adapter, so a ban degrades one channel, not the agent.
- **A5** The dashboard shows the live transcript and the reason code behind every decision.
- **A6** One classifier + one KB retriever behind all 4 channels — 4 channels, 1 brain.
- **A7** The escalation beat is demoable from a recorded loopback path, independent of hall PSTN audio.
- **A8** Every bonus layer is feature-flagged off the happy path.
- **A9** Nothing ships that both of us cannot explain in one sentence at 04:00.
- **A10** Deployment starts night 1; it is a role, not a day-2 task.
- **A11** The KB is a small fixed doc set seeded by hand — no ingestion pipeline.

**Delivery budget.** 2 people, ~18 usable hours. Any addition must displace something in NON-GOALS, not extend it.

---

## IMPLEMENTATION CONTRACT

### Actors and surfaces

| Actor | Authenticates? | Surface it lives on | Contract it is bound by |
|---|---|---|---|
| **Business owner** | Yes — the only login in the system | Owner dashboard + laptop headset/speaker | Takes over escalated calls; approves or closes escalated tickets; installs the KB via the wizard |
| **End customer** | Never | Their own WhatsApp / Instagram / Gmail / phone | Zero forms, zero OTP, zero account [F3] |
| **Agent (system)** | n/a | MCP server (6 tools) | Cannot act outside the 6 tools [A2]; cannot send on an escalated ticket [F9] |
| **Laya router (system)** | n/a | Called by the voice pipeline and by text triage | Must return the 4-field schema below or the contact escalates `[AQ-6]` |
| **Inngest worker (system)** | n/a | 2 jobs | Only async path [A3] |

**Surfaces.**

1. **Landing + 12-question wizard** — the onboarding surface where the owner installs the business's knowledge. Twelve answers become the root of `business_brain.md`. Wizard content, ordering, required-vs-optional and whether it runs before or after login are `[AQ-1]`.
2. **Owner dashboard** — exactly 4 panels. Panel composition is our choice, not the PS's; the 4 selected are Live Queue, Ticket Detail, Escalation Bay, Business Brain & Insights `[AQ-2]`. A fifth candidate (weekly insights) is folded into panel 4 to hold the count at 4 [F6].
3. **Voice pipeline** — Airtel number → Pipecat transport → Laya route → Kokoro TTS speech, with the escalation branch bridged to the owner's laptop audio [F2][F7].
4. **MCP server** — the 6 tools below. Nothing else is callable by the agent.
5. **Inngest worker** — 2 jobs: the weekly insights report (PS 2.5 bonus twist) and one undetermined second job `[Q5]`.

### State machines

**CALL** — spine is fixed:

```
ringing → laya_route → specialist → escalation → human_takeover → resolved
```

| From | To | Guard | Side effect |
|---|---|---|---|
| `ringing` | `laya_route` | inbound leg accepted on the one Airtel number | call record opened; audio frames start |
| `ringing` | `missed` | no leg accepted within the answer window `[AQ-3]` | event logged; no customer callback [NON-GOAL: outbound] |
| `laya_route` | `specialist` | Laya returns schema-valid output and no escalation rule matches | specialist (intent-scoped responder) `[AQ-4]` assigned |
| `laya_route` | `escalation` | schema invalid, timeout, or transport error | fail-safe beep `[AQ-5]` |
| `specialist` | `escalation` | any of R1–R4 matches (see routing table) | `beep.wav` played, AI voice muted, line held [F8] |
| `specialist` | `resolved` | specialist answers to completion, no rule matches `[AQ-7]` | transcript + reason codes written |
| `escalation` | `human_takeover` | owner clicks Take Over (or auto-bridge after N seconds `[AQ-8]`) | laptop mic/speaker bridged to the live leg |
| `escalation` | `resolved` | owner declines, or customer hangs up during the beep `[AQ-9]` | line released; ticket retains `escalated` |
| `human_takeover` | `resolved` | owner ends the conversation | line released; transcript attached |

**Invariants.** No transition may drop the live leg except `→ resolved` [F8]. There is no transition to a second number, no `transfer`, no `re-dial` [F2]. The AI does not resume speech after `human_takeover` `[AQ-10]`.

**TICKET** — spine is fixed:

```
new → triaged → replied → escalated → closed
```

| From | To | Guard | Side effect |
|---|---|---|---|
| — | `new` | inbound contact on WhatsApp / Instagram / Gmail | row created with channel, customer ref, raw payload |
| `new` | `triaged` | Laya/classifier returns valid output | intent, urgency, sentiment, confidence stored; routing decision logged |
| `triaged` | `replied` | confidence ≥ 70 and no escalation rule matches (R6) | KB-grounded reply sent via the channel tool |
| `triaged` | `escalated` | confidence < 70, or a rule matches (R1–R5) | draft held, never auto-sent [F9] |
| `replied` | `escalated` | customer replies and a rule now matches | draft held for owner |
| `triaged` / `replied` / `escalated` | `closed` | owner closes, or the sweeper closes after N hours `[AQ-11]` | immutable close event |

**Invariant.** `escalated` is never left by an automatic send [F9]. A voice contact also produces a ticket so one queue shows all 4 channels `[AQ-12]`.

### Laya output contract

Every routing decision consumes exactly this object. Laya returns nothing the router reads outside these four fields.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LayaRouteDecision",
  "type": "object",
  "additionalProperties": false,
  "required": ["confidence_score", "intent", "urgency", "sentiment"],
  "properties": {
    "confidence_score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "intent": {
      "type": "string",
      "enum": ["general", "technical", "sales", "human_escalation"]
    },
    "urgency": { "type": "integer", "minimum": 0, "maximum": 100 },
    "sentiment": {
      "type": "string",
      "enum": ["positive", "neutral", "negative", "distressed"]
    }
  }
}
```

`sentiment` values are our proposal `[AQ-13]`. Integer granularity (not float) is assumed `[AQ-14]`. `additionalProperties: false` means a Laya field we did not plan for must be dropped, not passed through `[AQ-15]`.

**Routing rule table — first match wins, evaluated in order.**

| # | Condition | Route | Effect on the call / ticket |
|---|---|---|---|
| **R1** | `intent == "human_escalation"` | escalate | beep, mute AI, hold line |
| **R2** | `confidence_score < 50` | escalate | **the low-confidence beep trigger** — the agent never guesses on a customer |
| **R3** | `sentiment == "distressed"` | escalate | treated as an urgency floor of 80 `[AQ-16]` |
| **R4** | `urgency >= 80` | escalate | threshold is ours, not the PS's `[AQ-17]` |
| **R5** | `50 <= confidence_score < 70` | specialist, **draft-only** | ticket → `escalated`, draft held, no auto-send [F9] |
| **R6** | `confidence_score >= 70` and `urgency < 80` and `intent in {general, technical, sales}` | specialist, auto-reply | text: reply sent → `replied`; voice: specialist continues speaking |
| **R7** | malformed output, no match, or Laya timeout `[AQ-5]` | escalate (fail-safe) | beep; a router error is never a silent ticket |

**Threshold summary.** `<50` beep · `50–69` draft-only · `≥70` auto-reply · `urgency ≥80` beep · `distressed` → beep. Voice and text share this table; only the effect differs.

**Reason codes (rev 1).** Every decision also carries the rule that fired (`R1`–`R7`) and, when
escalating, one reason from `explicit_request | low_confidence | distressed | urgent |
invalid_decision | router_error`. The last two exist only to keep the router total — malformed Laya
output must fail safe to a beep, never to a silent reply. Panels 1 and 2 render these codes verbatim,
which is what makes the reason code a judge can read (A5) rather than an internal log line.
Implementation `src/domain/routing.ts`; tests `tests/domain/routing.test.ts`.

### MCP tool signatures

Six tools, exact count [F6]. Signature notation is declarative — no implementation exists.

**Envelope (rev 1).** Every tool returns one shape and nothing else: `{ success, data, error, meta }`.
`data` carries the payload documented per tool below, and is `null` on failure. `error` is `null` on
success, and `{ code, message }` on failure where `code` is drawn from a frozen 13-code vocabulary:
`IDENTIFIER_MISSING`, `NO_MATCH`, `NOT_ON_WHATSAPP`, `MEDIA_TOO_LARGE`, `SESSION_DOWN`, `EMPTY_KB`,
`STORE_UNAVAILABLE`, `THREAD_NOT_FOUND`, `PERMISSION_DENIED`, `HUMAN_OWNED`, `SCOPE_MISSING`,
`NO_LIVE_LEG`, `AUDIO_DEVICE_MISSING`. `meta` is `{ tool, latency_ms, ticket_id }`, with
`ticket_id: null` for tools that are not ticket-bound. Envelopes are frozen at construction and
caller-supplied `meta` is copied, so no caller can mutate or alias a result in place. Domain
functions stay pure and return bare values — the envelope exists **only** at the tool boundary, one
unwrap point per tool. Implementation `src/domain/envelope.ts`; tests `tests/domain/envelope.test.ts`.

**1. `get_customer_profile`**
Params: `phone: string|null` (E.164), `email: string|null`, `channel: "whatsapp"|"instagram"|"gmail"|"voice"`. At least one identifier required.
Returns: `{ customer_id, phone, email, plan_tier: "Free"|"Pro", last_login: ISO8601|null, recent_orders: Order[], account_status: string, found: boolean }`.
Fails: `IDENTIFIER_MISSING`, `NO_MATCH` (returns `found: false`, not an error).

**2. `send_whatsapp_media`**
Params: `to_phone: string`, `media_type: "text"|"image"|"document"|"video"|"audio"`, `payload: string` (text body or media URL), `caption?: string`, `ticket_id: string`.
Returns: `{ message_id, status: "queued"|"sent"|"failed", error_code: string|null, ban_risk_notice: string }` — the notice is always present [F5].
Fails: `NOT_ON_WHATSAPP`, `MEDIA_TOO_LARGE`, `SESSION_DOWN` (Baileys unlinked).

**3. `search_markdown_rag`**
Params: `query: string`, `top_k: number = 5`, `min_score?: number`.
Returns: `{ chunks: [{ chunk_id, source_doc, heading_path, text, score }], total_matched: number }`.
Fails: `EMPTY_KB` (before the wizard is complete), `STORE_UNAVAILABLE`.

**4. `handle_instagram_interaction`**
Params: `thread_id: string`, `action: "read"|"draft"|"send"`, `draft_text?: string`, `ticket_id: string`.
Returns: `{ thread_id, message_id: string|null, status: "read"|"drafted"|"sent"|"blocked", draft_text: string|null }`.
Fails: `THREAD_NOT_FOUND`, `PERMISSION_DENIED` (dev-mode app scope `[Q3]`), `HUMAN_OWNED` (ticket is `escalated`, so `send` is refused [F9]).

**5. `triage_and_reply_gmail`**
Params: `thread_id: string`, `action: "triage"|"draft"|"send"`, `draft_body?: string`, `ticket_id: string`.
Returns: `{ thread_id, decision: LayaRouteDecision|null, draft_body: string|null, message_id: string|null, status: "triaged"|"drafted"|"sent"|"blocked" }`.
Fails: `THREAD_NOT_FOUND`, `SCOPE_MISSING`, `HUMAN_OWNED`.

**6. `escalate_to_human`**
Params: `ticket_id: string`, `reason: "low_confidence"|"distressed"|"urgent"|"explicit_request"|"invalid_decision"|"router_error"`, `transcript_snapshot: string`, `urgency: number`.
Returns: `{ escalation_id, beep_played: boolean, ai_muted: boolean, bridged: boolean, line_state: "held"|"bridged"|"released", owner_notified_at: ISO8601 }`.
Fails: `NO_LIVE_LEG` (text channel — the tool logs the escalation and does not beep), `AUDIO_DEVICE_MISSING`.

**Cross-tool invariants.** No tool accepts a destination number or a transfer target — `escalate_to_human` bridges the *existing* leg and cannot re-dial [F2]. No tool accepts customer credentials [F3]. No tool can send while its ticket is `escalated` except with the owner's explicit approval `[AQ-18]`. Every result is wrapped in the envelope above; a refusal is a `fail(code)` envelope, never a thrown exception.

### Data model

| Entity | Fields | Notes |
|---|---|---|
| **customers** | `customer_id` (pk), `phone` (E.164), `email`, `plan_tier` (`Free`\|`Pro`), `last_login` (ISO8601\|null), `recent_orders` (array), `account_status` | `last_login` conflicts with F3 — see `[AQ-19]`. `recent_orders` element shape and `account_status` values are `[AQ-20]` |
| **tickets** | `ticket_id` (pk), `channel`, `customer_id` (fk), `state` (5-state enum), `intent`, `urgency`, `sentiment`, `confidence_score`, `laya_raw` (json), `escalation_id` (fk\|null), `created_at`, `updated_at` | One row per inbound contact, including voice `[AQ-12]` |
| **events** | `event_id` (pk), `ticket_id` (fk\|null), `call_id` (null for text `[AQ-21]`), `type`, `actor` (`customer`\|`agent`\|`laya`\|`owner`\|`system`), `payload` (json), `ts` | Append-only. This is the audit log A5 depends on; never updated, never deleted. `type` vocabulary is `[AQ-22]` |
| **business_brain.md chunks** | `chunk_id` (pk), `doc_version`, `heading_path`, `text`, `token_count`, `embedding_ref`, `updated_at` | `business_brain.md` is the source of truth; chunks are derived and rebuildable. Store choice `[AQ-23]`. Version bumps on every wizard re-run `[AQ-24]` |

**Source of truth.** `business_brain.md` (owner-authored, wizard-seeded) → chunks are a derived index. Tickets and events are the operational truth; the dashboard never computes state the store does not hold.

**Ownership boundary.** One business, one tenant, one owner [F6 non-goal: no multi-tenant]. No customer record is created by the customer — records exist because the business's own data (or the wizard) supplied them `[AQ-25]`.

**Retention.** Events are retained for the whole window and beyond; no deletion path in the MVP `[AQ-26]`.

### Observability — what each panel must read to prove it is live

Each panel must show a **source read** and a **freshness stamp**. A panel that renders a static snapshot fails this contract.

| Panel | Must read | Live-proof the panel displays | Fails if |
|---|---|---|---|
| **1. Live Queue** | `tickets` where `state in (new, triaged, escalated)`, ordered by `urgency desc, created_at asc` | row count, per-channel counts for all 4 channels, `max(updated_at)` age in seconds | newest ticket age > 60 s while traffic is on, or a channel shows 0 for the whole session |
| **2. Ticket Detail** | `events` for one `ticket_id`, ordered `ts asc`, plus `tickets.laya_raw` | the ordered event trail (`classified → drafted/sent → escalated`) and the reason codes rendered from `laya_raw` | an event type present in the store that the panel does not render |
| **3. Escalation Bay** | live call state + the `escalate_to_human` return (`beep_played`, `ai_muted`, `bridged`, `line_state`) | an explicit **line is up** indicator plus one row per state transition with timestamps | `line_state` shown without a matching event, or a takeover shown without `bridged: true` |
| **4. Business Brain & Insights** | `business_brain.md` chunk count, `doc_version`, `updated_at`; latest Inngest run (job id, started, finished, item count) | chunk count, doc version, last rebuild time, last report run time | KB shown populated before the wizard completed, or a job shown green with no run record |

**Cross-panel.** Both Inngest jobs must be visible somewhere on the dashboard — placement is `[AQ-27]`. Panel 4 must distinguish "no report yet" from "report failed". Staleness is computed from `events.ts`, never from client clocks `[AQ-28]`.

---

## NON-GOALS

- **No outbound calling.** The agent never dials; customers always call in.
- **No call transfer, ever.** No second number, no PBX, no re-dial — `escalate_to_human` bridges the existing leg [F2].
- **No customer-facing auth.** No OTP, no magic link, no customer portal, no ticket-status page [F3].
- **No WhatsApp Business API / Meta verification sprint.** Baileys only, risk declared [F5].
- **No third language.** Hinglish voice, English text. No Marathi/Tamil, no language-detection UI.
- **No money movement.** No refunds, no cancellations, no payment-state mutation.
- **No business-system integration.** No CRM, no inventory, no second data source.
- **No model training or fine-tuning.** Prompt + retriever + fixed rules only.
- **No growth in the surface counts.** 4 channels / 6 tools / 4 panels / 2 jobs is the ceiling, including any 05:00 bonus that would breach it.
- **No multi-tenant, roles, or seats.** One business, one login, one owner.
- **No owner app, push, or SMS.** The browser dashboard is the only owner surface.
- **No analytics product.** The 4 panels are the analytics; no export, no warehouse, no admin console.
- **No 13th wizard question, no conditional wizard branching.** Exactly 12, linear `[AQ-1]`.

**Cut order when we slip:** bonus layers → channel depth → secondary-panel polish. **Never cut:** the voice escalation beat, the dashboard happy path, the README/deck/diagram.

---

## OPEN QUESTIONS

**Conflicts and blockers found while writing this contract.**

- **`[AQ-19]` — `customers.last_login` contradicts F3.** End customers never authenticate, so there is no customer login to record. Either this field is imported from the business's own product (where their customers *do* log in), or it means the owner's last login and belongs on a different entity. **TBD — needs validation via a one-line rule from the owner of this doc before the customers table is written.**
- **`[AQ-6]` — Laya must be treated as untrusted.** Schema-invalid output currently fails safe to `escalation` (R7), which costs a beep on every malformed response. If Laya is flaky, this becomes a beep storm. **TBD — needs validation via measured Laya error rate on the seed set.**
- **`[AQ-12]` — one queue vs two.** Making voice produce a `tickets` row keeps panel 1 honest, but it means the ticket state machine governs a call that is already mid-conversation. **TBD — needs validation via a 20-contact mixed-channel dry run.**

**Carried from Gate 2 (unchanged).**

- **Q1** Can an inbound call on the one Airtel number terminate into Pipecat at all? **TBD — needs validation via one live test call at T+1h.** *Biggest unknown in the build; if it fails, the escalation beat is recorded, not live.*
- **Q2** Which WhatsApp number do we risk on Baileys, and is there a spare? **TBD — needs validation via a throwaway-number link test on night 1.**
- **Q3** Does Instagram Messaging allow a send from a dev-mode Meta app inside the window? **TBD — needs validation via a test-user message send.**
- **Q4** Gmail on an unverified OAuth app: test users only, or verification required? **TBD — needs validation via test-user consent.**
- **Q5** Which is the second Inngest job? The weekly insights report is the bonus twist; the other is unconfirmed.
- **Q6** What decides "sensitive" — a fixed rule list or model judgement? The routing table encodes it as R1–R4, but the rule list itself is not signed off.
- **Q7** Does the agent auto-send low-risk replies, or draft everything? The PS says "drafts"; R6 encodes auto-send. **TBD — needs validation by re-reading PS 2.5 verbatim at 13:50.**
- **Q8** Which channels get the full loop vs. read-and-draft only?
- **Q9** Where does the before/after number come from? **TBD — needs validation via hand-timing a seeded 50-ticket set.**
- **Q10** The three pillars are literally "To be announced" in the PS PDF. **TBD — needs validation via an organizer at 13:50.**
- **Q11** Judging per-track or across the whole field? Changes pitch framing only.

**New assumptions introduced by this contract.**

- `[AQ-1]` The 12 wizard questions, their order, and their required/optional split are unknown; "exactly 12, linear" is our constraint, not the PS's.
- `[AQ-2]` The 4-panel composition is our choice. A fifth candidate (weekly insights) is folded into panel 4 to hold the count.
- `[AQ-3]` The `ringing → missed` answer window value is undecided.
- `[AQ-4]` "Specialist" is interpreted as an intent-scoped responder (`general`/`technical`/`sales`), one per intent, sharing one KB retriever.
- `[AQ-5]` Laya timeout value and retry count are undecided; R7 currently fails safe on the first failure.
- `[AQ-7]` The `specialist → resolved` exit (AI fully resolves a call) is **not** in the stated spine; it is added because otherwise every call must escalate.
- `[AQ-8]` Auto-bridge after N seconds vs. waiting for a click is undecided; the owner must not miss the beep.
- `[AQ-9]` Customer-hangup-during-beep semantics are undecided (ticket stays `escalated`, line released).
- `[AQ-10]` The AI does not resume speech after takeover — assumed, not stated.
- `[AQ-11]` The sweeper close interval N is undecided; auto-close may itself conflict with F9.
- `[AQ-13]` The sentiment enum values are our proposal.
- `[AQ-14]` Integer 0–100 confidence/urgency (not float, not 0–1).
- `[AQ-15]` `additionalProperties: false` — unknown Laya fields are dropped rather than passed through.
- `[AQ-16]` `distressed` implies an urgency floor of 80.
- `[AQ-17]` The `urgency >= 80` beep threshold is ours.
- `[AQ-18]` "Owner approval" as a tool-level override on an `escalated` ticket is not yet specified.
- `[AQ-20]` `recent_orders` element shape and `account_status` value set are unknown.
- `[AQ-21]` `call_id` exists only in the events table — calls may need their own entity; deferred to hold the entity count.
- `[AQ-22]` The `events.type` vocabulary is undecided.
- `[AQ-23]` Chunk store / embedding backend is undecided (A1 forbids a second datastore, so it must live inside the primary one).
- `[AQ-24]` `doc_version` bump semantics on wizard re-run are undecided.
- `[AQ-25]` Who supplies `customers` rows before any contact arrives is undecided — seeded demo data or wizard answers.
- `[AQ-26]` Retention/deletion expectations are unstated; MVP has no delete path.
- `[AQ-27]` Where the two Inngest job statuses render is undecided.
- `[AQ-28]` Server-side staleness only; client clocks are never trusted.

---

## HANDOFF

- **Ready for implementation?** **Partially.** The text channels (WhatsApp via Baileys, Gmail) and the whole dashboard/MCP layer are implementable against this contract today. Voice is gated on `Q1` — the PSTN-into-Pipecat question decides whether the escalation beat is live or recorded. Instagram is gated on `Q3`.
- **Needs architecture review?** Yes, narrow: `[AQ-21]` (calls table) and `[AQ-23]` (chunk store) both change the entity layout, and both must land before schema work starts.
- **Needs product clarification?** Yes, one item is a hard blocker: `[AQ-19]` (`last_login` vs. no-customer-auth). Two more shape the demo: `Q7` (auto-send vs. draft) and `[AQ-7]` (can the AI resolve a call unaided).
- **Next ECC lane:** `tdd-workflow` — write the 6 tool contracts as failing tests first, since they are the only action surface and the only place a 2-person squad can afford regressions. Then `verification-loop` before the 12:00 freeze, and `api-connector-builder` for the per-channel adapters if the Baileys/Instagram/Meta work starts eating the night.

**Freeze rule.** This file is the implementation contract. Changing a frozen constraint (F*) requires an explicit decision and a new revision; resolving an `AQ` requires striking it here, not in a chat.

**Revision log.**

- **rev 1 — envelope + reason codes.** Approved in session during S1. Tool returns are now wrapped in `{ success, data, error, meta }` at the tool boundary (domain stays pure); the 13-code failure vocabulary is frozen; `escalate_to_human.reason` gains `invalid_decision` and `router_error`; every routing decision carries its rule id. Still open: the state machines' event vocabulary `[AQ-22]` — S1 deliberately emits no event names rather than invent one.

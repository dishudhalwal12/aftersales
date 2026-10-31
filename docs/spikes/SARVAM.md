# Sarvam AI Per-Call Context Spike (Phase 1)

**Owner:** Developer B (Backend / Voice)
**Date:** 30 October 2026
**Question:** Can one rented Sarvam virtual number serve multiple businesses, where each call is grounded in the business the owner selected at call time — **without** mutating the shared agent prompt?

**Verdict: 🟢 GREEN (conditional).** Sarvam's platform design supports per-call variables plus mid-call HTTPS tool calls, which is exactly the two-layer mechanism this product needs. Live endpoint verification is pending Sarvam API credentials (none were available in Phase 1); the conditional items are listed in §6.

---

## 1. Why this spike exists

AfterSales AI uses a **single shared Sarvam agent and virtual number** for the hackathon. Judges place calls for Business A (CloudPulse CRM) and then Business B (Jaipur Smile Studio) back-to-back. If context were baked into the saved agent prompt, a per-business edit would leak one tenant's facts into another tenant's call — a hard multi-tenancy violation. The spike therefore tests whether context can be injected **per call** and whether grounding can be fetched **mid-call** from our own API.

## 2. Platform capabilities verified (docs)

Verified from Sarvam's documentation on 30 Oct 2026:

| Capability | What the docs state | Relevance |
| :--- | :--- | :--- |
| Agent anatomy | An agent is composed of **instruction, variables, voice, tools, hooks, and knowledge base**. | Confirms variables and tools are first-class agent components. |
| Variables | Variables are *"dynamic values read into and collected out of each conversation."* | **This is the per-call context channel.** Values are supplied per conversation, not baked into the shared instruction. |
| API tools | Tools let the agent *"call your own APIs over HTTPS."* | The agent can query our RAG endpoint mid-call instead of relying on prompt memory. |
| Outbound calling | The Voice Agents API supports outbound campaigns and instant calls; webhook events fire per call attempt, including failures. | A call can be started programmatically and its lifecycle observed server-side. |

Reference docs:
- <https://docs.sarvam.ai/conversations/build/agent/overview> (agent anatomy, variables)
- <https://docs.sarvam.ai/voice-agents/build/tools> (HTTPS API tools)
- <https://www.sarvam.ai/products/voice-agents> (product capability summary)

**Not yet verified live:** exact REST path and payload for "place instant call", the variable placeholder syntax inside the instruction, the tool-call request/response envelope, and the call-completion webhook schema. These require a `SARVAM_API_KEY` and an agent created in the Sarvam dashboard; §6 defines the 30-minute re-check.

## 3. Context-passing mechanisms considered

### 3.1 Per-call variables — chosen for personalization
`POST /api/voice/start-session` creates a `VoiceTestSession` row, then asks Sarvam to place an outbound call **passing variables for that specific call**:

```text
business_name = "CloudPulse CRM"
business_type = "SaaS (B2B)"
demo_pin      = "4821"
session_id    = "vsess_..."
```

The shared agent instruction only references placeholders (for example, greeting the caller with the business name). No business facts are stored in the shared instruction, so Business B can never inherit Business A's context. `business_id` itself stays server-side and is deliberately **not** trusted from the agent or caller.

### 3.2 Mid-call tool lookup — chosen for grounding (mandatory)
Every substantive question is answered from our RAG endpoint, not from the agent's memory:

```text
Agent  ──HTTPS POST──▶  /api/voice/sarvam-tool-search
                        { sessionId, demoPin, callerPhone, query }
Server ──resolves session──▶ businessId
       ──search_markdown_rag(businessId, query, topK=4)──▶ groundedFacts + citedChunkIds
Agent  ──speaks──▶ grounded answer (or escalation when confidence < 50)
```

This preserves the PRD's grounding invariant for voice: the spoken answer must trace back to that business's `KnowledgeChunk` rows.

### 3.3 Caller-phone active-session lookup — chosen as fallback
If variables are not echoed into the tool call, the server resolves the session by `judgePhone` + `status IN (initiated, ringing, in_progress)` + `expiresAt > now`. The `VoiceTestSession` schema already indexes `[judgePhone, status]` for this lookup.

Trade-off: ambiguous when two active sessions exist for one phone. Resolution: the most recent unexpired session wins; the PIN disambiguates (3.4).

### 3.4 4-digit `demoPin` — last-resort fallback
If neither `sessionId` nor phone resolution succeeds, the agent asks the caller to read out the 4-digit PIN shown on the dashboard and calls the tool with it. PINs are:
- single-use per session, 10-minute expiry;
- validated against an **active** session only;
- never sufficient to cross tenants without a matching `businessId` session row.

A PIN alone must never be treated as authentication for anything beyond resolving the demo session.

## 4. Chosen architecture

```text
Dashboard "Call Me Now"
   │
   ▼
POST /api/voice/start-session          (Phase 4)
   ├─ assertBusinessOwnership(userId, businessId)      ← tenant guard
   ├─ create VoiceTestSession { businessId, judgePhone, demoPin, expiresAt: now+10m }
   └─ Sarvam outbound call with per-call variables (3.1)
            │
            ▼
   Agent asks questions ──▶ POST /api/voice/sarvam-tool-search (3.2)
            │                     └─ resolve session → RAG → grounded facts
            ▼
   Sarvam completion webhook ──▶ POST /api/voice/sarvam-webhook (Phase 4)
                                 └─ transcript, duration, escalation ticket
```

**Hard rules carried into Phase 4:**
1. Never write business facts into the shared agent instruction; only placeholders/variables.
2. `businessId` is always resolved from a `VoiceTestSession` row bound at `start-session`; never from LLM output, PIN payload, or caller speech.
3. Tool endpoint requires a shared-secret header (to be added as `SARVAM_TOOL_SECRET`) and must validate `demoPin`/`callerPhone` against a live session.
4. Tool failure or low confidence → spoken escalation, never a fabricated answer (maps to Rule R7).

## 5. Risks and mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Exact Sarvam endpoints/payloads unverified | Phase 4 integration churn | §6 live spike with credentials before building the client |
| Shared number + caller ID collision between demo runs | Wrong business context | Session expiry (10 min), PIN disambiguation, most-recent-session rule |
| Telephony compliance (DLT/TRAI) for Indian outbound calls | Calls rejected | Use the Sarvam-provided number and registered caller ID; keep TEST_MODE simulation for rehearsal |
| Tool latency hurts conversation flow | Poor demo experience | Local SQLite keyword/BM25 retrieval, topK=4, target < 1.5 s |
| Agent "helpfully" invents facts when the tool fails | Grounding violation | Instruction forbids answering outside tool results; tool returns `escalateToHuman: true` on failure |
| Prompt edited per business under time pressure | Cross-tenant leakage | Rule 1 above; review any dashboard prompt change |

## 6. Live execution plan (when credentials arrive)

1. Create one test agent with instruction placeholders for `business_name` and `demo_pin`.
2. Place an instant outbound call with `business_name = "CloudPulse CRM"`; confirm the greeting names CloudPulse.
3. Immediately place a second call with `business_name = "Jaipur Smile Studio"` on the same number; confirm the greeting switches and the saved agent is unchanged.
4. Register an HTTPS tool pointing at `PUBLIC_WEBHOOK_BASE_URL + /api/voice/sarvam-tool-search`; capture the exact request body sent by Sarvam.
5. Call the tool with a pricing question; confirm the response is spoken verbatim from `groundedFacts`.
6. Capture the completion webhook payload; map fields to `VoiceTestSession.transcript`, `durationSeconds`, `sarvamInteractionId`.
7. Record the verified endpoint paths and payloads in this document.

**Acceptance:** PRD AT-04 (voice personalization for A vs B on one number) plus AT-05 (no cross-tenant call sessions).

## 7. Fallback if variables are unsupported

- **Pin-first flow:** agent asks for the 4-digit PIN on every call; the tool resolves the business from the PIN. Slightly slower greeting, but personalization and grounding are unaffected.
- **Simulation mode:** if outbound calls are unavailable (no number/credits), the dashboard renders a clearly labelled `TEST_MODE` simulated call using the seeded session transcript. The UI must never present a simulation as a real connected call.

## 8. Phase 1 contract implications

- `POST /api/voice/start-session` response already reserves `contextInjectionMode: "PER_CALL_VARIABLES"` (PRD §5.3), matching mechanism 3.1.
- `VoiceTestSession` stores `demoPin`, `judgePhone`, `businessId`, `expiresAt`, and an indexed `[judgePhone, status]` pair — everything mechanisms 3.1–3.4 need.
- No schema changes required for Phase 4.

## 9. Phase 4 implementation notes (31 October 2026)

The backend now implements the architecture in §3–§4 (`src/lib/sarvam.ts` + the three
`/api/voice/*` routes). Two items from §6 remain open until credentials exist:

- **Outbound endpoint:** `startOutboundCall` defaults to `POST https://api.sarvam.ai/v1/voice-agents/calls` with the `api-subscription-key` header and a body of `{ agent_id, to, from?, variables }`. Both the base URL and path are overridable via `SARVAM_API_BASE_URL` / `SARVAM_OUTBOUND_PATH`, so the exact endpoint can be corrected without a code change once step 1 of §6 is run.
- **Tool/webhook envelopes:** `/api/voice/sarvam-tool-search` requires `x-sarvam-tool-secret` and accepts `{ sessionId?, demoPin?, callerPhone?, query }`; `/api/voice/sarvam-webhook` requires `x-sarvam-webhook-secret` and accepts `{ sessionId, status?, sarvamInteractionId?, transcript?, durationSeconds?, callerRequestedHuman?, resolved? }`. Sarvam's dashboard tool/webhook configuration must map its fields onto these names (steps 4 and 6 of §6).

Everything server-side is exercised without credentials: session resolution, grounding,
escalation tickets and secret checks are covered by `tests/sarvam.test.ts`, and one can call the
tool endpoint with a real session row to see the same `groundedFacts` the agent would speak. A
live call is still required to confirm the agent echoes the per-call variables and speaks the
tool result verbatim.

## 10. Status in this tree (merged from the `backend` branch)

The backend was later rewritten on this branch: the voice code now lives in
`src/server/voice/sarvam.ts` plus four routes (`start-session`, `sarvam-tool-search`,
`sarvam-webhook`, and `sarvam-context`, which the original branch did not have). The
architecture described in §3–§4 is unchanged; three contract names moved:

| §9 said | This tree |
|---|---|
| `src/lib/sarvam.ts` | `src/server/voice/sarvam.ts` + route handlers |
| webhook secret `x-sarvam-webhook-secret` / `SARVAM_WEBHOOK_SECRET` | `x-sarvam-token` / `SARVAM_WEBHOOK_TOKEN` |
| outbound URL = `SARVAM_API_BASE_URL` + `SARVAM_OUTBOUND_PATH` | one full URL in `SARVAM_CALL_ENDPOINT` |

The `x-sarvam-tool-secret` guard from §9 was **not** carried over: the tool endpoint is
reachable by the voice platform with no shared secret and is scoped instead by the session
id / demo PIN / caller phone it is called with (see the route's header comment). That is a
deliberate hackathon trade-off, not an oversight — worth revisiting before a real deployment,
because the PIN is short enough to guess.

## 11. Dynamic business context (31 October 2026)

The agent template is **never edited per business**. An owner saves the business-specific
context; the on-start tool resolves the tenant from a trusted identifier and returns the
variables. This replaces "prompt per business" with "one prompt, data per call".

### 11.1 Storage

`BusinessVoiceAgentContext` (1:1 with `Business`, `businessId` is the primary key) holds only
what the brain does not: `businessAddress`, `weeklyHolidays` (JSON array of weekday names),
`supportedLanguages` (JSON array), `appointmentPolicy`, `agentInstructions`, plus the mapping
(`virtualNumber`, `agentId`) and `isActive`. Name, type, description, services, opening hours,
FAQs, refund policy, escalation contacts and tone stay on `Business` and are composed into the
payload. Editing any of those through the owner API rebuilds the `KnowledgeChunk` rows and
bumps `brainVersion` in the same transaction, so text and voice answers cannot drift.

### 11.2 Trusted resolution

`POST /api/voice/sarvam-context` accepts:

| Body | Meaning |
|---|---|
| `agentId` and/or `virtualNumber` | trusted path; the DB maps them to exactly one business |
| `sessionId` / `demoPin` | demo fallback for the shared number |

A `business_id` in the body is ignored. Resolution is strict: unknown identifier → 404;
more than one business on an identifier, or an agent id and number that point at different
businesses → 409; mapping row with `isActive = false` → 409. The resolver never returns the
first match.

Auth: `SARVAM_CONTEXT_TOKEN` (fallback `SARVAM_WEBHOOK_TOKEN`) is compared in constant time
against `x-saram-token`, `x-sarvam-token`, `x-sarvam-context-token`, or `Authorization: Bearer`.
If no secret is configured the endpoint still works but reports `contextAuth: "unconfigured"`
and lists the reason in `warnings` — it never claims to be secured.

### 11.3 Owner API

- `GET /api/businesses/[id]/voice-agent/context` — owner session required; returns the core
  facts, the call-script fields, the mapping, `brainVersion` and `chunkCount`.
- `PUT /api/businesses/[id]/voice-agent/context` — same auth. Context fields are replaced;
  core facts are only replaced for keys present in the body. A number or agent id already
  mapped to a different business is rejected with 409.

UI: Dashboard → Voice test → **What the phone agent knows**. The save action shows whether the
brain was rebuilt.

### 11.4 Sarvam dashboard configuration

1. **Agent template** — create variables named exactly
   `business_name`, `business_type`, `business_description`, `business_address`,
   `products_services`, `opening_hours`, `weekly_holidays`, `supported_languages`, `faqs`,
   `appointment_policy`, `return_policy`, `escalation_email`, `escalation_phone`, `agent_tone`,
   `agent_instructions`, `uploaded_knowledge`, `tool_search_url`, `request_tool_url`. The prompt
   contains only placeholders — no business names, prices or addresses).
2. **On-start tool** — `POST <PUBLIC_WEBHOOK_BASE_URL>/api/voice/sarvam-context`, header
   `x-saram-token: <SARVAM_CONTEXT_TOKEN>`, body sends the call's `agent_id` and/or the
   `virtual_number` that received the call. Map every returned `variables.*` key onto the
   template variable of the same name.
3. **Mid-call tool** — unchanged: `/api/voice/sarvam-tool-search` with `session_id` / query.
4. **Number → business** — Dashboard → Voice test → mapping fields. Bind each number (or the
   agent id, when each business has its own agent) to one business before taking real inbound
   calls. The demo's single shared number intentionally stays unmapped and uses the
   session/PIN fallback, because binding it to two businesses is refused by design.

### 11.5 Limits

- Every variable is sized to the limit the onboarding API accepts for its field
  (`src/shared/fact-limits.ts`), so a value the owner could type is never silently dropped. A row
  that still exceeds its budget — older data, a direct DB edit — is clipped server-side and named in
  the context route's `warnings`, so the cut is visible instead of quiet. Joined lists (holidays,
  languages) and derived customization sentences keep their own 200 / 3,000 character budgets.
- `uploaded_knowledge` carries the wizard's `.md` upload (20,000 character budget). The RAG tool
  remains the retrieval path for it: the variable is context, the citation still comes from
  `/api/voice/sarvam-tool-search`.
- Uniqueness of `virtualNumber` / `agentId` is enforced by the resolver and the owner API, not
  by a DB constraint — the resolver must be able to see two rows and refuse the call. Two
  concurrent owner saves could still create a duplicate; the resulting calls fail closed (409).
- The demo pinned `VoiceTestSession` still expires after 10 minutes; mappings do not expire.
- `contextAuth: "unconfigured"` must never ship to production; set `SARVAM_CONTEXT_TOKEN`.

## 12. On-demand customizations (31 October 2026)

### 12.1 Storage

`BusinessVoiceAgentCustomization` is one row per `(businessId, customizationType)`:

| column | meaning |
|---|---|
| `customizationType` | `availability`, `appointment_booking`, `cancellation_policy`, `rescheduling_policy`, `callback_requests`, `urgent_call_handling`, `business_specific_instructions` |
| `configuration` | validated JSON (same pattern as `ChannelConnection.configJson`) |
| `isEnabled` | a disabled row is treated as absent — the agent never applies it |

A new type needs a parser + a default; the table itself does not change. The schema is
applied with `prisma db push` like the rest of this project (there is no migrations folder).

### 12.2 Availability semantics

Availability is resolved for a **date** in the business's own time zone:

1. a temporary closure covering the date → closed (reason is shareable with the caller);
2. a date-specific override → its windows / closed flag;
3. otherwise the recurring weekly schedule.

Each day allows up to three non-overlapping windows. Slot length, buffer, max per slot,
minimum advance booking and maximum future window are stored on the availability row; no
slot is ever claimed as bookable — there is no calendar integration in this deployment.

### 12.3 Owner API

- `GET /api/businesses/[id]/voice-agent/customizations`
- `PUT /api/businesses/[id]/voice-agent/customizations`

Both require the owner session and go through `loadOwnedBusiness`, so a foreign business id
is a 403. `PUT` accepts either `{ "customizations": { "<type>": { "isEnabled": true,
"configuration": { … } } } }` or a flat `{ "<type>": { … } }`; unknown types, empty bodies and
invalid JSON are 400. Every write is re-validated server-side (times, dates, overlap, time
zone, E.164 transfer number, 20 KB size cap).

UI: Dashboard → Voice test → **Availability and call rules** (weekly grid, date overrides,
temporary closures, appointment/cancellation/rescheduling settings, callback, urgent and
business instructions). The existing **What the phone agent knows** panel keeps the general
profile, FAQs and languages; the two panels do not duplicate fields.

### 12.4 Runtime context

`POST /api/voice/sarvam-context` now also returns `customizations` (resolved availability,
each enabled configuration, `appointmentMode: "request_only"`, `bookingBackend: "none"`,
`dateSpecificOverridesRecurring: true`) and adds these keys to `variables`:

`availability_summary`, `available_today`, `todays_hours`, `next_7_days`, `timezone`,
`appointment_booking`, `appointment_rules`, `appointment_mode`, `cancellation_policy`,
`rescheduling_policy`, `callback_behavior`, `urgent_call_instructions`,
`emergency_instructions`, `business_specific_instructions`, `safety_instructions`,
`request_tool_url`.

The seven-day summary is computed per call in the business time zone, so a date override
made five minutes ago is what the agent reads. Values are clipped to 3,000 characters.
`safety_instructions` is mandatory and cannot be switched off.

### 12.5 Request tool

`POST /api/voice/sarvam-request` — body:

```json
{
  "requestType": "appointment",
  "agentId": "…", "virtualNumber": "+91…",
  "sessionId": "…", "demoPin": "1234",
  "externalRequestId": "call-abc-1",
  "customerName": "Asha", "customerPhone": "+919812345678",
  "preferredDate": "2026-11-04", "preferredTime": "11:20",
  "notes": "follow-up for a cleaning", "emergency": false
}
```

- Identity is resolved exactly like the on-start endpoint: trusted agent/number or
  session/PIN, with `businessId` honoured **only** for an authenticated owner that owns it.
- When `SARVAM_CONTEXT_TOKEN` is set, the shared secret is required; otherwise an owner
  session is required. (Same capability trade-off as the search tool when unconfigured.)
- Response always contains `"confirmed": false`. Accepted requests become a VOICE ticket in
  the R5 draft queue (`intent` = `appointment_request` / `reschedule_request` /
  `cancellation_request` / `callback_request`) and are idempotent on
  `externalRequestId` (or `sessionId + type` when the platform has no request id).
- `emergency: true` wins over everything: R1, escalated immediately, urgency 100, and the
  message tells the caller to contact local emergency services.
- With appointment booking disabled, an `appointment`/`reschedule` request is **not**
  recorded; the response tells the agent to offer a callback instead.

Sarvam dashboard: register a tool named e.g. `record_request` pointing at
`<PUBLIC_WEBHOOK_BASE_URL>/api/voice/sarvam-request`, send `x-saram-token`, and instruct the
agent to call it after collecting the fields the owner selected. The URL is also injected as
`request_tool_url`.

### 12.6 Honest limits

- No calendar/booking integration exists, so nothing is ever booked or cancelled. The agent
  collects a request and says it is pending; the owner confirms in the queue.
- Date overrides and weekly windows are advisory inputs to the conversation; the agent must
  not derive specific free slots from them, because actual bookings are unknown.
- `availability_summary` covers today plus seven days; a caller asking about a later date
  must be offered a callback rather than a guessed answer.
- Healthcare guardrails are mandatory: no diagnosis, no dosage, emergencies go to local
  emergency services before any appointment discussion.

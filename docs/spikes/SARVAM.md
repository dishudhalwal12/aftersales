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

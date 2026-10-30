# Phase 4 — Sarvam Voice, Hardening & Judge Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 4 is complete when a judge picks Business A or Business B on `/dashboard?tab=voice`,
enters a phone, gets a session bound to that business (4-digit PIN, 10-minute expiry), has the voice
agent answer from *that* business's chunks with the same confidence floor the text path uses, and the
finished call's transcript, duration, status and escalation outcome appear on the dashboard and as a
`VOICE` ticket in the live queue — every claim proven by an executable gate.

**Architecture:** The voice code already exists (`start-session`, `sarvam-tool-search`,
`sarvam-webhook`, `sarvam-context`, `VoiceTestPanel`). This plan buys the *proof* the PRD gate demands
and fixes the defects that proof exposes: the voice path bypasses the confidence floor, writes two
values outside the frozen §3 enums, trusts caller-supplied citations, is not idempotent on replay, can
speak a FAQ's question back as the answer, and never shows a completed call after a reload.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6 + Postgres, `node:test`.

**Spec:** `docs/prd/ps_2_5_master_executable_prd_team_41.md` rev 4 — §0 (safety invariants), §3
(schema + enums), §5.3–5.4 (voice contracts), §6 Phase 4 + its gate, §8 AT-04/AT-05/AT-09/AT-11/AT-12.

---

## Context — what already ships (verified this session, `3cb0664`)

- `src/app/api/voice/{start-session,sarvam-tool-search,sarvam-webhook,sarvam-context}/route.ts`
- `src/server/voice/sarvam.ts` — `sarvamStatus`, `generateDemoPin`, `placeOutboundCall`,
  `buildCallVariables` (live vs explicit `dry_run`, never a faked dial).
- `src/components/dashboard/VoiceTestPanel.tsx` — phone field, **Call me now**, status stepper,
  `demoPin` badge, mid-call tool search, completion write-back, dry-run banner, honesty list.
- `src/app/dashboard/actions.ts` — **Reset demo state** action, wired in `DashboardShell`.
- `src/server/ai/rag.ts` — `searchMarkdownRag`, `retrievalConfidence`, `bestSentences` (the offline
  text provider's confidence floor already lives here).
- `docs/spikes/SARVAM.md` — GREEN verdict, §10 records the per-call variable + tool-call mechanism.
- Local DB seeded: 2 users, 3 businesses, 18 tickets, 18 knowledge chunks; `npm test` → 120/120.

## Defects found by probe (reproduced, not assumed)

1. **The voice path has no confidence floor.** `sarvam-tool-search` scores
   `round((score / (score + 2)) * 100 + 35)`, so *any* chunk that matched at all lands ≥ 50.
   Probe: Jaipur Smile + "What is the price of the Pro Plan and does it include WhatsApp invoicing?"
   → `confidenceScore: 86`, i.e. the agent would read the clinic's price list back as the answer.
   The text path on the same question returns `20` → R2. This breaks §0's "confidence < 50 must never
   send" invariant on the one channel where a wrong answer is spoken out loud.
2. **`status: "test_mode"` is outside the frozen §3 enum**
   (`initiated|ringing|in_progress|completed|failed`), written by `start-session` on a dry run.
3. **`escalationOutcome: "call_failed"` is outside the frozen §3 enum**
   (`resolved_by_ai|escalated_to_owner`), written by `sarvam-webhook` when the call failed.
4. **Citations from the webhook caller are trusted.** Posting another tenant's `citedChunkIds` with
   `escalateToHuman: false` marks the ticket `answered` / R6 — AT-09 says an auto-sent reply must cite
   this business's chunk.
5. **A replayed completion webhook creates a second ticket** (no idempotency on the completion path).
6. **A completed call never appears in the dashboard.** The panel shows one line right after recording;
   reloading `?tab=voice` renders nothing. The gate says transcript, duration and status "automatically
   appear in the dashboard".
7. **The agent can speak the question back.** `bestFact()` picks the highest-overlap sentence, which in
   a FAQ chunk is the `Q:` line: clinic + "What should I do after an extraction?" →
   `groundedFacts: "Q: What should I do after an extraction?"`.
8. **No executable Phase 4 gate** and no `verify:phase4` script.

## Global Constraints

- Frozen contracts: PRD §2 routes, §5.3/§5.4 payload keys, §3 column names and enum values. Additive
  *response* fields are allowed (`callMode` already is one); renames and new enum values are not.
- `businessId` always comes from the `VoiceTestSession` row (or a tenant-owned business lookup), never
  from the caller's speech, the PIN payload or model output.
- The telephone leg stays unplaced without `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT`, and stays
  labelled as a dry run in both the API response and the panel.
- No secret in the client bundle or a rendered page. `.env` is gitignored; `.env.example` holds empty
  values only.
- Commit style: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`), no attribution trailer.
- `npm test` stays green (120 today); every new pure function gets a `node:test` case.
- The gate is executable proof: a FAIL group is a defect to fix, never an assertion to loosen.

## Testing strategy

- **Pure logic:** `node --env-file-if-exists=.env --test 'tests/**/*.test.ts'` — no DB, no network.
- **HTTP + DB:** `node --env-file-if-exists=.env scripts/verify-phase4.mjs` — boots `next dev` on
  `127.0.0.1:3125` with a generated `SARVAM_API_KEY` (no endpoint ⇒ dry run) so AT-12 can prove the key
  never reaches HTML, drives the real routes with a real judge session, asserts DB rows, then removes
  every row it created. This is the Phase 4 gate.
- **App:** `npx tsc --noEmit` and `npx next build`.

## Interfaces

| Producer | Consumer | Contract | Pre-flight finding |
|---|---|---|---|
| Task 1 (`scripts/verify-phase4.mjs`, `npm run verify:phase4`) | Tasks 3–6 append groups to the same file | helpers `get`, `post`, `group`, `expect`, `expectIncludes`, `parseJson`, `cleanup`; `RUN`, `CALLER_PHONE` | Tasks 3–6 add groups only; no helper rename |
| Task 2 (`src/server/voice/grounding.ts`) | `sarvam-tool-search` route, Task 6 gate | `groundVoiceAnswer(query, hits): { groundedFacts, citedChunkIds, confidenceScore, escalateToHuman }` | the route currently inlines `bestFact` + the score transform; that inline code is replaced, response keys unchanged |
| Task 2 (`retrievalConfidence`) | grounding module, AT-04 gate check | shares the offline text provider's floor | already exported from `src/server/ai/rag.ts`; no edit needed there |
| Task 3 (`src/server/voice/session-state.ts`) | `start-session`, `sarvam-webhook`, panel chip | `VOICE_STATUSES`, `callPlacementStatus(result, current)`, `completionOutcome({escalate, status})` | `start-session` writes `test_mode` today and the webhook writes `call_failed`; both call sites are in this task |
| Task 4 (`voice:<sessionId>` external id) | `resetDemoAction`, Task 6 gate replay check | `Ticket.externalMessageId` unique ⇒ one ticket per session | `resetDemoAction` deletes only `externalMessageId: null` rows — updated in the same task, or **Reset demo state** would leave voice tickets behind |
| Task 5 (`VoiceSessionView` in `src/shared/api.ts`) | `dashboard/page.tsx`, `VoiceTestPanel` | `{ sessionId, status, demoPin, transcript, durationSeconds, escalationOutcome, createdAt } \| null` | the page already loads the active business; the extra query is one `findFirst` |
| Task 6 (docs) | judge + reviewer | `verify:phase4` command, A→B walkthrough | `docs/DEMO-SCRIPT.md` beat 9 describes the old one-line banner; updated |

Pre-flight also checked: no `verify-phase4`/`verify:phase4` exists yet; `phase-3-channels`' gate script
is **not** on this branch, so the Phase 4 gate carries its own auth helper rather than importing one;
`globals.css` already holds `.voice-stepper` and `.pin`, so the panel needs no new CSS primitives.

## Rulings carried into the ledger

- **R1 — voice confidence is `retrievalConfidence`, not a BM25 transform.** §0's "confidence < 50 never
  sends" must mean the same thing on every channel; the offline text provider already owns that
  semantic. Cost if wrong: a voice question the BM25 score would have answered now escalates instead.
- **R2 — a dry run keeps `status: "initiated"`.** §3's enum is frozen; the dry-run fact travels as the
  existing `callMode` response field and in the panel chip. Cost if wrong: rows written as `test_mode`
  by the dev tree read as `initiated`; the seeded DB has zero voice sessions.
- **R3 — a failed call records `escalationOutcome: "escalated_to_owner"`.** `call_failed` is outside §3;
  a dropped call is a call the owner must return, and `status: "failed"` still distinguishes it. Cost if
  wrong: the outcome field alone cannot tell a failed call from a human-handled one.
- **R4 — voice idempotency reuses `Ticket.externalMessageId` as `voice:<sessionId>`.** §3 defines that
  column as the duplicate guard; a session is one inbound conversation. Cost if wrong: **Reset demo
  state** must also delete `voice:` tickets — done in the same task.
- **R5 — the navbar business switcher is the voice panel's business selector.** It already scopes every
  panel including voice; a second selector in the panel would be a control that can disagree with the
  URL. Cost if wrong: one PRD bullet rendered by another control.
- **R6 — the Phase 4 gate is self-contained.** `scripts/verify-phase3.mjs` lives on an unmerged branch;
  duplicating ~60 lines of boot/auth helpers is cheaper than a cross-branch dependency. Cost if wrong:
  the two scripts must be reconciled when Phase 3 merges.

## Review Focus

- **A wrong-tenant question on the voice path** — must escalate with `citedChunkIds: []`, never speak
  the other business's facts, and must not depend on the model: the floor is deterministic.
- **A replayed completion webhook** — exactly one `VOICE` ticket, the second response says
  `duplicate: true`, and the session's transcript/duration are not overwritten by the replay.
- **Caller-supplied citations** — a foreign chunk id must never produce `actionStatus: "answered"`; a
  freed-text transcript must not be able to smuggle one in either.
- **The dry run** — no key ⇒ no dial, `callMode: "dry_run"` in the JSON, an explicit banner in HTML, and
  never a status value outside the frozen enum.
- **Dashboard after reload** — the last call's transcript, duration, status and outcome must come from
  the database, not from React state, or the gate claim is only true in the tab that recorded it.

---

### Task 1: The Phase 4 gate, part 1 — session lifecycle, tenant isolation, expiry

**Why:** Phase 4's gate is a list of claims; today no command proves any of them, and the first run
exposes the enum violation that Task 3 fixes.

**Files:**
- Create: `scripts/verify-phase4.mjs`
- Modify: `package.json` (add `"verify:phase4"`)

1. RED — write the script with the harness and the first three groups, then run it.
   - Harness, copied in shape from `scripts/verify-phase4.mjs`'s sibling `verify-phase1.mjs`: spawn
     `next dev -p 3125` with `SARVAM_API_KEY=gate4-not-a-real-key` and **no**
     `SARVAM_CALL_ENDPOINT` (dry run), poll `GET /api/health`, kill the child in `finally`, write
     `process.exit(1)` on any failure, `mkdtemp` the server log.
   - Constants: `CLOUDPULSE`, `CLINIC`, `RIVAL`, `RUN = gate4-<Date.now()>`,
     `CALLER_PHONE = "+919" + last 8 digits of RUN` (one phone for the whole run — the gate is the
     "same shared number, two businesses" claim).
   - `auth()` group: `POST /api/auth/judge-demo` → 303 + `as_session` cookie.
   - `session()` group: `POST /api/voice/start-session` for `CLOUDPULSE` →
     `200`, `sessionId` string, `demoPin` matches `/^\d{4}$/`, `contextInjectionMode ===
     "PER_CALL_VARIABLES"`, `businessId === CLOUDPULSE`, `callMode === "dry_run"`,
     `sarvamConfigured === false`, and `status` ∈ `initiated|ringing|in_progress|completed|failed`.
   - `isolation()` group: the same call for `RIVAL` → `403` with the frozen error shape;
     no cookie → `401`; `judgePhone: "9812345678"` (not E.164) → `400`.
   - `resolution()` group: tool-search with `demoPin` only → 200 with `businessName: "CloudPulse CRM"`;
     with `callerPhone` only → 200; with neither → `400`; with `sessionId: "nope"` → `404`; an expired
     session (created through Prisma with `expiresAt` in the past) → `410`.
   - `cleanup()` in `finally`: delete `voiceTestSession` rows where `judgePhone = CALLER_PHONE` and
     `ticket` rows where `customerHandle = CALLER_PHONE`.
   - Run: `node --env-file-if-exists=.env scripts/verify-phase4.mjs`.
   - Expected: `auth` and `resolve` PASS; `session` **FAIL on `status ∈ frozen enum`** with
     `status test_mode`; exit 1.
2. GREEN so far — nothing to change yet: the failure is Task 3's. Re-running after Task 3 must show the
   same group passing; the gate script stays untouched.
   - Expected: recorded in Task 3, not here.

**Completion contract:** the script exists, the RED run's output is read (the `test_mode` line quoted),
`npm test` still green, and the script's cleanup ran (count of `gate4` sessions after the run is 0).

**Commit:** `test(phase4): add the executable voice gate's session groups`

---

### Task 2: One confidence floor for voice and text (PRD §0, §4.1, AT-04)

**Why:** defect 1 and 7. The agent currently speaks an answer whenever BM25 matched at all, and can
speak a FAQ's question back.

**Files:**
- Create: `src/server/voice/grounding.ts`, `tests/server/voice/grounding.test.ts`
- Modify: `src/app/api/voice/sarvam-tool-search/route.ts`

1. RED — write `tests/server/voice/grounding.test.ts` against the module that does not exist yet.
   - Fixture: `chunkMarkdown(compileBrainMd(BUSINESS_A.facts))` / `BUSINESS_B.facts` mapped to
     `BrainChunk`s exactly as `tests/server/ai/rag.test.ts` does (prefixes `cp` / `js`).
   - Cases:
     - `groundVoiceAnswer("What is the price of the Pro Plan and does it include WhatsApp invoicing?",
       searchMarkdownRag(chunksB, ...))` → `escalateToHuman: true`, `confidenceScore < 50`,
       `citedChunkIds: []`, and `groundedFacts` contains no `₹1,200` or `₹4,500`.
     - the same query over `chunksA` → `confidenceScore >= 50`, `citedChunkIds` = `["chk_cp_02"]`,
       `groundedFacts` contains `₹1,499` and not `Q:`.
     - `"What should I do after an extraction?"` over `chunksB` → `groundedFacts` starts with
       `Bite on the gauze` (the answer, not the question) and cites `chk_js_05`.
     - `"Tell me something about your team"` over `chunksA` → `escalateToHuman: true`,
       `confidenceScore: 0`, `citedChunkIds: []`.
     - empty hits → same zero/escalate shape.
     - every returned id is one of the passed hits, and confidence never exceeds 95.
     - `spokenFacts("", "Q: Same? A: Different.")` returns `Different.` (a `Q:`-only content has no
       answer sentence, so the question is dropped rather than spoken as the answer).
   - Run: `node --env-file-if-exists=.env --test tests/server/voice/grounding.test.ts`.
   - Expected: FAIL — `Cannot find module .../grounding.ts`.
2. GREEN — implement `src/server/voice/grounding.ts`:
   - `spokenFacts(query, content, limit = 2)`: split on sentence boundaries, drop sentences that start
     with `Q:`, strip a leading `A:`, then rank the rest with `tokenize` overlap (position as the tie
     break) and join with a space; fall back to the raw content only when nothing survives.
   - `groundVoiceAnswer(query, hits)`: `confidenceScore = retrievalConfidence(query, hits)`; select up
     to two hits that cover at least one distinct query token, best coverage first, BM25 as the tie
     break; `escalateToHuman = confidenceScore < 50 || selected.length === 0`; when escalating return
     `citedChunkIds: []` and the honest `"I do not have a grounded answer for that."` prefix-free
     message; otherwise cite the selected ids and join their `spokenFacts` with one space.
   - Run the test file again. Expected: all cases PASS.
3. Rewire `src/app/api/voice/sarvam-tool-search/route.ts`: replace `bestFact` and the score transform
   with `groundVoiceAnswer(query, hits)`; keep every response key (`businessName`, `groundedFacts`,
   `citedChunkIds`, `confidenceScore`, `escalateToHuman`, `sessionId`); when `escalateToHuman` the
   message names the business (`I do not have a grounded answer for that. A human from <name> can help.`).
   Delete the now-unused `bestFact`.
4. `npx tsc --noEmit` → Expected: exit 0.
5. Commit: `fix(voice): hold the voice path to the same grounded-confidence floor`.

**Completion contract:** the four grounding tests were watched fail then pass, the route imports the
module, `npm test` green (120 + 7 new).

---

### Task 3: Keep the session inside the frozen enums (PRD §3, §5.3)

**Why:** defects 2 and 3, plus the panel chip that reads `test_mode` as a status.

**Files:**
- Create: `src/server/voice/session-state.ts`, `tests/server/voice/session-state.test.ts`
- Modify: `src/app/api/voice/start-session/route.ts`, `src/app/api/voice/sarvam-webhook/route.ts`,
  `src/components/dashboard/VoiceTestPanel.tsx`

1. RED — `tests/server/voice/session-state.test.ts`.
   - `VOICE_STATUSES` deep-equals `["initiated","ringing","in_progress","completed","failed"]`.
   - `callPlacementStatus({ mode: "dry_run", ok: true }, "initiated")` → `"initiated"`.
   - `callPlacementStatus({ mode: "live", ok: true }, "initiated")` → `"initiated"`.
   - `callPlacementStatus({ mode: "live", ok: false }, "initiated")` → `"failed"`.
   - `completionOutcome({ escalate: true, status: "completed" })` → `"escalated_to_owner"`.
   - `completionOutcome({ escalate: false, status: "completed" })` → `"resolved_by_ai"`.
   - `completionOutcome({ escalate: false, status: "failed" })` → `"escalated_to_owner"` (R3).
   - every value returned is in `VOICE_STATUSES` / `ESCALATION_OUTCOMES`.
   - Run: Expected FAIL — module missing.
2. GREEN — implement `src/server/voice/session-state.ts` with `VOICE_STATUSES`,
   `ESCALATION_OUTCOMES = ["resolved_by_ai","escalated_to_owner"]`, `callPlacementStatus`,
   `completionOutcome`; re-run the file. Expected PASS.
3. `start-session/route.ts`: use `callPlacementStatus(call, "initiated")`; the response keeps
   `callMode`, `callPlacementOk`, `callPlacementReason`, `sarvamConfigured` unchanged.
4. `sarvam-webhook/route.ts`: use `completionOutcome({ escalate, status })`.
5. `VoiceTestPanel.tsx`: the "test mode — no call placed" chip keys off `session.callMode === "dry_run"`
   instead of `stage === "test_mode"`; the stepper never receives a non-enum stage. Add
   `data-voice-status={session.status}` on the stepper and `data-dry-run` on the chip so the gate can
   assert the rendered state.
6. `node --env-file-if-exists=.env scripts/verify-phase4.mjs` → Expected: `session` group now PASS
   (`status initiated`), the other groups unchanged.
7. `npm test` → Expected: green (120 + 7 + 7).
8. Commit: `fix(voice): keep session status and outcome inside the frozen enums`.

**Completion contract:** RED read (`module not found`), GREEN read (both new files), gate's `session`
group green in this session.

---

### Task 4: Completion webhook — verified citations, one ticket per session (AT-09, AT-10)

**Why:** defects 4 and 5, and **Reset demo state** must keep cleaning up after voice.

**Files:**
- Create: `src/server/voice/completion.ts`, `tests/server/voice/completion.test.ts`
- Modify: `src/app/api/voice/sarvam-webhook/route.ts`, `src/app/dashboard/actions.ts`

1. RED — `tests/server/voice/completion.test.ts` against the module that does not exist.
   - `verifiedCitations(["chk_cp_02","chk_nope","chk_js_04"], new Set(["chk_cp_02","chk_cp_04"]))` →
     `["chk_cp_02"]`.
   - duplicates collapse: `["chk_cp_02","chk_cp_02"]` → `["chk_cp_02"]`.
   - non-strings and an empty set → `[]`.
   - `voiceMessageId("vsess_1")` → `"voice:vsess_1"`.
   - `completionDecision({ escalate: true, grounded: true })` → `{ actionStatus: "escalated", state:
     "escalated", rule: "R1" }`; `{ escalate: false, grounded: true }` → `{ "answered", "replied", "R6" }`;
     `{ escalate: false, grounded: false }` → `{ "draft", "triaged", "R5" }`.
   - Run: Expected FAIL — module missing.
2. GREEN — implement `src/server/voice/completion.ts` (pure, no Prisma) and re-run. Expected PASS.
3. `sarvam-webhook/route.ts`:
   - `externalMessageId: voiceMessageId(session.id)` on the `ticket.create`.
   - Replace `parseCitations` with `verifiedCitations(body.citedChunkIds, ids of this business's
     chunks)` loaded through `loadBusinessChunks(session.businessId)`; use `completionDecision` for
     `actionStatus` / `state` / `rule`.
   - Wrap the session update + ticket creation so a `P2002` on the external id becomes:
     `findFirst({ where: { businessId, externalMessageId } })`, no second ticket, response
     `{ ..., duplicate: true, ticketId: existing.id }`; keep the session's stored transcript and
     duration from the **first** completion (a replay must not overwrite them).
   - Response gains `duplicate: boolean` (additive) and keeps every existing key.
4. `src/app/dashboard/actions.ts`: **Reset demo state** also deletes tickets whose `externalMessageId`
   starts with `voice:`, so a demo reset still cleans voice tickets (R4).
5. `node --env-file-if-exists=.env --test 'tests/**/*.test.ts'` → Expected green.
6. Commit: `fix(voice): make completion idempotent and citations tenant-verified`.

**Completion contract:** completion tests watched fail then pass; reset action read back; suite green.

---

### Task 5: The completed call is visible on the dashboard after a reload (Phase 4 gate)

**Why:** defect 6 — the gate claim "transcript, duration and status automatically appear in the
dashboard" is false the moment the page reloads.

**Files:**
- Modify: `src/shared/api.ts` (`VoiceSessionView`), `src/app/dashboard/page.tsx`,
  `src/components/dashboard/VoiceTestPanel.tsx`

1. `src/shared/api.ts`: add
   `VoiceSessionView { sessionId, status, demoPin, transcript: string | null, durationSeconds: number | null, escalationOutcome: string | null, createdAt: string }`.
2. `src/app/dashboard/page.tsx`: load the latest `voiceTestSession` for the active business
   (`orderBy createdAt desc`, `take 1`, business-scoped `where`) and pass it as `lastSession`; map it to
   the view type. Pass `sarvamConfigured` as today.
3. `VoiceTestPanel.tsx`: accept `lastSession`. Render a **Last call** card above the panel whenever it
   is non-null and the panel has no live session: status pill (`data-voice-status`), duration in
   seconds, `escalationOutcome`, the persisted transcript in a `<pre class="transcript">`-shaped block
   with `data-voice-transcript`, and a line pointing at the queue. When a call is recorded in this tab,
   call `router.refresh()` after `emitDataChanged()` so the card is the server's row, not local state.
   Keep every existing element (`Call me now`, stepper, `.pin` badge, dry-run banner) unchanged.
4. `npx tsc --noEmit` → Expected: exit 0.
5. `npx next build` → Expected: exit 0.
6. Commit: `feat(voice): show the last completed call from the database`.

**Completion contract:** typecheck and build read; the card renders from `lastSession` (no local state
fallback), verified by Task 6's gate group.

---

### Task 6: Finish the gate — personalization A→B, write-back, dashboard, secrets, docs

**Why:** the Phase 4 gate's headline claim (same number, Business A then Business B) and the judge
walkthrough are the last unproven things.

**Files:**
- Modify: `scripts/verify-phase4.mjs`, `README.md`, `docs/DEMO-SCRIPT.md`, `docs/ARCHITECTURE.md`,
  `.env.example` (only if a key's description drifted)

1. Add gate groups:
   - **`personalization()`** — one phone for both: start a session for `CLOUDPULSE`, tool-search
     `"What is the price of the Pro Plan and does it include WhatsApp invoicing?"` → `confidenceScore
     >= 50`, `citedChunkIds[0]` starts `chk_cp_`, `groundedFacts` contains `₹1,499`; then start for
     `CLINIC` on the **same** `CALLER_PHONE`, the same question → `escalateToHuman === true`,
     `confidenceScore < 50`, `citedChunkIds: []`, and the body contains none of `₹1,499`, `Pro Plan`
     pricing claims; then the clinic's own question `"What are your prices and hours?"` →
     `confidenceScore >= 50` and `₹1,200` present. Assert both sessions still name their own business
     in the DB (the shared number is never mutated).
   - **`completion()`** — `POST /api/voice/sarvam-webhook` for the clinic session with
     `{ status: "completed", transcript, durationSeconds: 96, escalateToHuman: true, citedChunkIds:
     ["chk_cp_02"] }` (a *foreign* chunk id on purpose) → `sessionStatus: "completed"`,
     `duplicate: false`, `escalationOutcome` ∈ the frozen enum, `actionStatus` is **not** `"answered"`;
     the DB session carries the transcript, `durationSeconds: 96` and `externalMessageId ===
     voice:<sessionId>`; the ticket is `channel: "VOICE"`, `businessId: CLINIC`, `state:
     "escalated"`, and `GET /api/businesses/<clinic>/tickets?ticketId=` returns 3 events.
   - **`replay()`** — post the same completion again → `duplicate: true`, same `ticketId`, and exactly
     one `VOICE` ticket with that external id in the DB; the stored transcript is unchanged.
   - **`dashboard()`** — `GET /dashboard?tab=voice&business=<clinic>` with the judge cookie → 200,
     contains the transcript text and `96` seconds and `data-voice-transcript`; and the same page does
     **not** contain the gate's `SARVAM_API_KEY` value (`AT-12`).
   - **`auth()`** for the webhook: no cookie and no `x-sarvam-token` → `401`; cookie for a non-owner →
     `403`.
   - Every created row is removed in `cleanup()` (`sessions` by phone, `tickets` by
     `externalMessageId startsWith "voice:"` **and** `customerHandle = CALLER_PHONE`).
2. Run: `node --env-file-if-exists=.env scripts/verify-phase4.mjs` → Expected: **every group PASS**;
   a failing check is a defect in Tasks 2–5, fixed there and re-run.
3. `npm test` → Expected green; `npx tsc --noEmit` → exit 0; `npx next build` → exit 0.
4. Docs:
   - `README.md`: acceptance row AT-04 now names the gate command; add `npm run verify:phase4` next to
     the other verification commands.
   - `docs/DEMO-SCRIPT.md`: beat 9 (voice) rewritten to the two-business sequence on one number, the
     4-digit PIN, and the last-call card; the fallback row states that without Sarvam keys the call is a
     labelled dry run.
   - `docs/ARCHITECTURE.md`: the voice sequence gains the confidence floor and the idempotent
     completion (`voice:<sessionId>`), and the security table's voice row names the verified citation.
5. Commit: `test(phase4): prove the voice gate end to end`.

**Completion contract:** full gate output read with every group PASS, suite green, typecheck and build
green, and the docs diff visible in the same commit.

---

## Gate summary (what "Phase 4 complete" means after Task 6)

- A session is created for one business, with a 4-digit PIN and a 10-minute expiry, and a dry run is
  labelled as one in the JSON and on screen.
- Business A and Business B, on one phone number and one shared agent, answer with their own facts; the
  same question under the wrong business escalates below confidence 50 with no citation.
- A completion writes transcript, duration, status and outcome onto the session and one `VOICE` ticket
  into the queue; a replay creates nothing new; a foreign citation never marks the ticket answered.
- `/dashboard?tab=voice` shows the last completed call from the database.
- No Sarvam secret appears in any HTML response.
- `npm run verify:phase4`, `npm test`, `npx tsc --noEmit` and `npx next build` are green in one session.

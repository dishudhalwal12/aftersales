# Phase 3 — Channels, Webhooks & the Executable Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3 is complete when an inbound channel delivery — owner-simulated or provider-token-signed
— travels retrieval → routing → ticket + append-only events with tenant-scoped idempotency,
`DRAFT_ONLY` channels hold at R5, and every claim is proven by an executable gate.

**Architecture:** The code for Phase 3 already exists (`ChannelsPanel`, the webhook route,
`respondToContact`, ticket actions, insights). This plan buys the *proof* the PRD gate demands and
fixes the two defects that proof exposes: a global `externalMessageId` that leaks another tenant's
ticket on replay, and an inbound route no external provider can call because it requires an owner
cookie. Two small pure modules make the new behavior unit-testable; one HTTP+DB gate script proves the
PRD gate.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6 + Postgres, `node:test`.

**Spec:** `docs/prd/ps_2_5_master_executable_prd_team_41.md` rev 4 — §0 (safety rules), §1.3 (routes),
§3 (schema), §4.1–4.3 (RAG + R1–R7), §6 Phase 3 + its gate, §8 AT-05/AT-06/AT-09/AT-10.

---

## Context — what already ships (do not rebuild)

Verified in this session, on branch `phase-0-1-foundation` @ `3cb0664`:

- `src/components/dashboard/ChannelsPanel.tsx` — truthful badges, webhook simulator, "Deliver once" /
  "Deliver twice" with an on-screen duplicate verdict.
- `src/components/dashboard/LiveQueuePanel.tsx` — split-pane detail with event trail and the
  **Approve & send draft / Resolve escalation / Close ticket** buttons.
- `src/app/api/channels/webhook/[provider]/route.ts` — POST + readiness GET.
- `src/server/business/service.ts` — one inbound path: `searchMarkdownRag` →
  `classifyAndDraft` → `evaluateRoutingRules` → `Ticket` + 4 `TicketEvent` rows.
- `src/server/business/tickets.ts` — human-only exits `approve_draft`, `resolve`, `close`.
- `src/server/business/insights.ts` + route — weekly sentiment and recurring complaints.
- `src/app/api/ai/text-query/route.ts` — grounded text answers with sources.
- 120 unit tests green; local Postgres seeded (2 users, 3 businesses, 18 tickets, 18 chunks).

Two defects were reproduced by probe (not assumed):

1. **Cross-tenant replay leak.** `Ticket.externalMessageId` is globally `@unique`. Posting a message
   with an id already used by another tenant returns *that tenant's* ticket — probe returned
   `businessId: biz_nimbus_03` and Nimbus's private answer to a CloudPulse request. Violates §0's
   tenant invariant and AT-05.
2. **No provider can call the webhook.** The route calls `requireUser()` unconditionally, so only the
   owner's browser (the simulator) can deliver. Phase 3's "real webhook listeners" need a
   provider-signed path; `sarvam-webhook` already models it with `x-sarvam-token`.

## Global Constraints

- Frozen contracts: PRD §2 route paths, §5 request/response payload names. No renames.
- `businessId` always comes from the authenticated session **or** a verified provider token — never
  from LLM output.
- No secret in the client bundle; `.env` is gitignored, `.env.example` holds empty values only.
- Commit style: Conventional Commits, no attribution trailer.
- `npm test` must stay green (120 tests today); every new pure function gets a `node:test` case.
- The gate is executable proof: a FAIL/FAIL group is a defect to fix, not an assertion to loosen.
- Channel transports stay labelled simulated; this plan does not add a live Meta/Google session.

## Testing strategy

- **Pure logic:** `node --test 'tests/**/*.test.ts'` — no DB, no network.
- **HTTP + DB:** `node --env-file-if-exists=.env scripts/verify-phase3.mjs` — boots `next dev` on
  `127.0.0.1:3124`, drives the real routes with a real judge session, asserts DB rows, then removes
  every `gate3-*` ticket it created. This is the Phase 3 gate.
- **App:** `npx tsc --noEmit` and `npx next build`.

## Interfaces

| Producer | Consumer | Contract | Pre-flight finding |
|---|---|---|---|
| Task 1 (`scripts/verify-phase3.mjs`, `npm run verify:phase3`) | Tasks 2, 3 append groups to the same file | helpers: `get`, `getWithCookie`, `post`, `patch`, `group`, `expect`, `cleanup` | Task 2/3 add groups only; no helper rename |
| Task 2 (`prisma/schema.prisma`) | `respondToContact` duplicate path, webhook route, gate DB count | `@@unique([businessId, externalMessageId])` → Prisma `where: { businessId_externalMessageId: { businessId, externalMessageId } }` | the old `where: { externalMessageId }` becomes a type error — updated in the same commit |
| Task 3 (`src/server/business/channel-webhook.ts`) | `src/app/api/channels/webhook/[provider]/route.ts`, unit test | `channelForProvider(provider: string): TicketChannel \| null`; `isWebhookTokenValid(expected: string, provided: string): boolean` | route-local `PROVIDER_CHANNEL` is replaced; GET readiness keeps using the same mapping |
| Task 3 (`CHANNEL_WEBHOOK_SECRET`, header `x-channel-token`) | route, gate script, `.env.example` | empty secret ⇒ token path disabled; gate injects a generated secret into the spawned server | gate must set the env before spawning, or read it for `VERIFY_BASE_URL` runs |

Pre-flight also checked: no existing `verify-phase3` script or `CHANNEL_WEBHOOK_SECRET` reference; no
migrations folder to collide with (the repo uses `prisma db push`); `prisma/dev.db` is untracked.

## Rulings carried into the ledger

- **R1 — composite idempotency key.** PRD §3 shows `externalMessageId @unique`; the probe proves a
  global key leaks across tenants. §0's tenant invariant and AT-05 outrank the schema line, so the key
  becomes `@@unique([businessId, externalMessageId])`. Cost if wrong: nothing needs global uniqueness;
  a provider that reused one id across two businesses still gets one ticket per business, which is
  correct.
- **R2 — provider token path.** §6 Phase 3 names "real webhook listeners" but the route is
  cookie-only, so no provider can deliver. Add the optional `CHANNEL_WEBHOOK_SECRET` path, mirroring
  `SARVAM_WEBHOOK_TOKEN`. Cost if wrong: one optional env key and one branch; the simulator path is
  unchanged.
- **R3 — no `TicketDetailDrawer.tsx` extraction.** §2 is a *recommended* structure; the drawer is the
  right pane of `LiveQueuePanel` and Phase 3's requirement (the two human-action buttons inside it)
  already ships. Extraction would be a UI refactor with no gate-visible behavior.
  Cost if wrong: a reviewer hunting the filename; no behavior change.

## Review Focus

1. **Same `externalMessageId` from two tenants** — the second delivery must create its own tenant's
   ticket and must never return the other tenant's id, query or answer.
2. **Provider token with a guessed/foreign `businessId`** — a valid token is the platform's authority,
   but an unknown business must be `404` and must not create a ticket under any other tenant.
3. **Two simultaneous replays of one id** — exactly one ticket, exactly one response, both callers
   agree on the ticket id; a unique-index race must not 500.
4. **`DRAFT_ONLY` + confident + cited** — must be R5 `draft`, never `AUTO_SENT`; only the human
   `approve_draft` action may move it to `replied`.
5. **Malformed inbound payloads** — unknown provider, non-JSON body, missing `externalMessageId`,
   oversized query: `400`/`404` with the frozen error shape, no partial ticket.

---

### Task 1: The Phase 3 gate, part 1 — channels, replay, R5, human actions, insights

**Why:** Phase 3's gate is a list of claims; today only the UI asserts them and no command proves
them. This task builds the executable gate for everything that already works.

**Files:**
- Create: `scripts/verify-phase3.mjs`
- Modify: `package.json` (add `"verify:phase3"`)

**Interfaces:**
- Produces: `node --env-file-if-exists=.env scripts/verify-phase3.mjs` → exit 0 with
  `PASS — N/N checks green`; helpers `get(path)`, `getWithCookie(path, cookie)`,
  `post(path, body, cookie, headers)`, `patch(path, body, cookie)`, `group(name, run)`,
  `expect(label, ok, detail)`, and `cleanup()` that deletes every ticket whose
  `externalMessageId` starts with `gate3-`.

- [ ] **Step 1: Write the script**

  Header comment states the gate's two claims (idempotency is one ticket, `DRAFT_ONLY` is R5) and the
  `VERIFY_PORT` / `VERIFY_BASE_URL` convention copied from `scripts/verify-phase1.mjs`. Defaults:
  `VERIFY_PORT=3124`, boot timeout 90 s, kill the child in `finally`.

  Groups and assertions (all use `run = \`gate3-${Date.now()}\`` as the external-id prefix):

  - **auth:** `POST /api/auth/judge-demo` → 303 and an `as_session` cookie. Fail the run if absent.
  - **channels state:** `GET /api/channels/webhook/whatsapp?businessId=biz_cloudpulse_01` → 200,
    `status: "CONNECTED"`, `autoSend: true`, `configured: true`;
    `.../instagram?businessId=biz_jaipursmile_02` → `DRAFT_ONLY`, `autoSend: false`;
    `.../gmail?businessId=biz_jaipursmile_02` → `TEST_MODE`; `.../telegram?...` → 404;
    `GET /api/channels/webhook/whatsapp` with no cookie → 401.
  - **surface:** `GET /dashboard?tab=channels` with the cookie → 200 and body contains
    `Simulate an inbound webhook`, `externalMessageId`, `Deliver twice`, `Instagram DM`.
  - **idempotency (AT-10):** POST `/api/channels/webhook/whatsapp`
    `{ businessId: biz_cloudpulse_01, externalMessageId: \`${run}-idem\`, customerName: "Gate",
    customerHandle: "+910000000000", query: "What is the price of the Pro Plan?" }` twice. Assert:
    both 200; same `ticketId`; first `duplicate === false`, second `true`; `prisma.ticket.count`
    for that business + id is 1; ticket detail `events.length === 4`.
  - **R5 draft-only:** POST `/api/channels/webhook/instagram` for `biz_jaipursmile_02` with
    `query: "What are your prices and hours?"` → `routingRuleHit === "R5"`, `actionStatus ===
    "draft"`, `shouldAutoSend === false`, `sources.length > 0`, `confidenceScore >= 50`; detail
    events contain `DRAFT_SAVED` and not `AUTO_SENT`; `PATCH /api/businesses/biz_jaipursmile_02/tickets`
    `{ticketId, action: "approve_draft"}` → `state: "replied"`, `actionStatus: "answered"`; detail
    events now contain `HUMAN_APPROVED_SEND`; a second `approve_draft` → 409.
  - **escalation + resolve:** POST `/api/channels/webhook/whatsapp` for `biz_jaipursmile_02` with
    `query: "Let me talk to a real human manager"` → `R1`, `actionStatus: "escalated"`;
    `PATCH .../tickets` `{action: "resolve"}` → `state: "closed"`; detail events contain
    `HUMAN_RESOLVED`; `approve_draft` on it → 409.
  - **insights:** `GET /api/businesses/biz_jaipursmile_02/insights` → 200, `windowDays === 7`,
    `totalTickets >= 1`, `sentiment` has the four keys, `recurringComplaints` is an array.
  - **text-query regression (AT-09):** POST `/api/ai/text-query`
    `{ businessId: biz_cloudpulse_01, customerName: "Judge", customerHandle: "judge@sphinx.mnit.ac.in",
    channel: "TEXT_MODAL", query: "What is the price of the Pro Plan and does it include WhatsApp invoicing?" }`
    → 200, `actionStatus: "answered"`, `sources.length > 0`, and every `sources[].chunkId` exists in
    `GET /api/businesses/biz_cloudpulse_01/brain` chunk ids; the same body with
    `businessId: "biz_nimbus_03"` → 403.
  - **cleanup (finally):** `prisma.ticket.deleteMany({ where: { externalMessageId: { startsWith:
    "gate3-" } } })`; a cleanup failure fails the run.

- [ ] **Step 2: Run the gate**

  Run: `npm run verify:phase3`
  Expected: `PASS — N/N checks green`, exit 0. Record N.

- [ ] **Step 3: Prove the unit suite and types are untouched**

  Run: `npm test` → `tests 120`, `pass 120`, `fail 0`.
  Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/verify-phase3.mjs package.json
  git commit -m "test(phase3): add the executable channel and queue gate"
  ```

**Completion contract:** the gate's full output read (every group PASS), suite output read, typecheck
exit 0. Verification-only task: no production code changed.

---

### Task 2: Tenant-scoped webhook idempotency (AT-05 + AT-10)

**Why:** a replay key must be scoped to the tenant that received it. Today the global unique index
returns another tenant's ticket and its private answer — reproduced in this session.

**Files:**
- Modify: `prisma/schema.prisma` (`Ticket.externalMessageId`)
- Modify: `src/server/business/service.ts` (duplicate lookup)
- Modify: `scripts/verify-phase3.mjs` (new group)
- Modify: `docs/ARCHITECTURE.md` (data-model row, later in Task 4 if preferred — but the schema note
  ships in this commit's code comment)

**Interfaces:**
- Produces: `principal key = (businessId, externalMessageId)`; Prisma input
  `businessId_externalMessageId: { businessId: string; externalMessageId: string }`.
- Consumes: Task 1's gate helpers.

- [ ] **Step 1: Add the failing gate group**

  Add `cross-tenant idempotency (AT-05)` to the script:
  1. Import `prisma` from `../src/server/db.ts` and `respondToContact` from
     `../src/server/business/service.ts`.
  2. Load `biz_nimbus_03`; create its ticket with `externalMessageId: \`${run}-cross\``,
     `query: "What is your refund policy?"`, `channel: "GMAIL"`; keep `nimbusTicketId` and
     `nimbusAnswer` (its private answer: `No refunds after the first 24 hours.`).
  3. As the judge, POST the **same** id to `/api/channels/webhook/whatsapp` with
     `businessId: "biz_cloudpulse_01"` and a grounded query.
  4. Assert: 200; `duplicate === false`; `businessId === "biz_cloudpulse_01"`;
     `ticketId !== nimbusTicketId`; `answer` does not contain `No refunds after the first 24 hours`;
     DB has exactly one CloudPulse ticket with that id and the Nimbus row is unchanged.
  5. Track the Nimbus ticket id so cleanup removes it.

- [ ] **Step 2: Run it to watch the leak**

  Run: `npm run verify:phase3`
  Expected: FAIL on `duplicate === false` / `businessId` / `ticketId !== nimbusTicketId` — the route
  returns Nimbus's ticket (the RED).

- [ ] **Step 3: Scope the key in the schema**

  `Ticket.externalMessageId` becomes `String?` (no field-level `@unique`); add
  `@@unique([businessId, externalMessageId])` beside the existing indexes, with a one-line comment:
  "provider ids are tenant-scoped; a global key lets one tenant's replay read another's ticket (AT-05)".

- [ ] **Step 4: Push and regenerate**

  Run: `npx prisma db push`
  Expected: `Your database is now in sync with your Prisma schema`, exit 0; client regenerated.

- [ ] **Step 5: Scope the duplicate lookup**

  In `respondToContact`'s `P2002` branch, replace `findUnique({ where: { externalMessageId } })` with
  the compound `where` above. Keep the existing "if not found, rethrow" behavior.

- [ ] **Step 6: Typecheck and re-run the gate**

  Run: `npx tsc --noEmit` → exit 0.
  Run: `npm run verify:phase3` → every group PASS, including `cross-tenant idempotency (AT-05)` and the
  replay/event-count checks from Task 1.

- [ ] **Step 7: Run the unit suite**

  Run: `npm test` → 120/120 pass.

- [ ] **Step 8: Commit**

  ```bash
  git add prisma/schema.prisma src/server/business/service.ts scripts/verify-phase3.mjs
  git commit -m "fix(channels): scope webhook idempotency to the tenant"
  ```

**Completion contract:** RED output read (leak visible), then GREEN output read; typecheck and suite
read.

---

### Task 3: Provider-signed inbound webhooks

**Why:** an external provider has no owner cookie. Phase 3's "real webhook listener" needs a
shared-secret path; otherwise the endpoint only ever serves the simulator.

**Files:**
- Create: `src/server/business/channel-webhook.ts`
- Create: `tests/server/business/channel-webhook.test.ts`
- Modify: `src/app/api/channels/webhook/[provider]/route.ts`
- Modify: `scripts/verify-phase3.mjs`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `channelForProvider(provider: string): TicketChannel | null` — trims/lowercases, maps
    `whatsapp → "WHATSAPP"`, `instagram → "INSTAGRAM"`, `gmail → "GMAIL"`, everything else `null`.
  - `isWebhookTokenValid(expected: string, provided: string): boolean` — `false` when `expected` is
    empty or either side is empty or lengths differ; otherwise `crypto.timingSafeEqual` on UTF-8
    buffers.
- Consumes: `CHANNEL_WEBHOOK_SECRET` from `process.env`; header `x-channel-token`.

- [ ] **Step 1: Write the failing unit test**

  `tests/server/business/channel-webhook.test.ts`:
  - `channelForProvider("whatsapp") === "WHATSAPP"`, `(" Instagram ") === "INSTAGRAM"`,
    `("gmail") === "GMAIL"`, `("telegram") === null`, `("") === null`.
  - `isWebhookTokenValid("", "anything") === false` (token path disabled by default);
    `("secret", "") === false`; `("secret", "wrong") === false`;
    `("secret", "secret") === true`; `("secret", "secret-longer") === false`.

  Run: `node --test tests/server/business/channel-webhook.test.ts`
  Expected: FAIL — cannot resolve `src/server/business/channel-webhook.ts` (RED).

- [ ] **Step 2: Implement the module**

  Pure functions above; `import { timingSafeEqual } from "node:crypto"` and
  `type TicketChannel` from `../../shared/domain.ts`. No Prisma, no Next imports.

- [ ] **Step 3: Run the unit test to green**

  Run: `node --test tests/server/business/channel-webhook.test.ts` → 2 suites pass, 0 fail.

- [ ] **Step 4: Add the failing gate group**

  At the top of the script, before spawning: `const webhookSecret =
  process.env.CHANNEL_WEBHOOK_SECRET?.trim() || \`gate3-secret-${process.pid}\``; when spawning the
  server (`VERIFY_BASE_URL` unset) set `process.env.CHANNEL_WEBHOOK_SECRET = webhookSecret` so the
  child inherits it. For `VERIFY_BASE_URL` runs, fail the group with a clear message if
  `CHANNEL_WEBHOOK_SECRET` is unset — never skip silently.

  Group **provider token**:
  - POST `/api/channels/webhook/gmail` with **no cookie** and `x-channel-token: <secret>` for
    `biz_cloudpulse_01`, `externalMessageId: \`${run}-token\``, grounded query → 200, `duplicate:
    false`, `businessId: biz_cloudpulse_01`, ticket exists in DB.
  - Same POST with no cookie and no token → 401.
  - Same POST with no cookie and `x-channel-token: wrong` → 401.
  - Token valid but `businessId: "biz_does_not_exist"` → 404, and no ticket row for that id.

  Run: `npm run verify:phase3`
  Expected: FAIL — token delivery answers 401 because the route still requires a session (RED).

- [ ] **Step 5: Let the route accept the provider path**

  - Replace the route-local `PROVIDER_CHANNEL` with `channelForProvider` (both POST and GET).
  - `const platformAuthorised = isWebhookTokenValid((process.env.CHANNEL_WEBHOOK_SECRET ?? ""),
    request.headers.get("x-channel-token") ?? "");`
  - `const user = platformAuthorised ? null : await requireUser();`
  - Business resolution: `user !== null` → `loadOwnedBusiness(user.id, businessId)` (unchanged);
    platform path → `prisma.business.findUnique({ where: { id: businessId } })`, `404` when absent.
  - Nothing else changes: `respondToContact`, idempotency and the response body stay identical.

- [ ] **Step 6: Re-run gate + test + typecheck**

  Run: `npm run verify:phase3` → every group PASS, including `provider token`.
  Run: `npm test` → all tests pass (120 + 2 new).
  Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 7: Document the key**

  `.env.example`, below the Sarvam block:
  ```env
  # Shared secret a channel adapter sends as `x-channel-token` on inbound webhooks.
  # Set = a provider may POST /api/channels/webhook/[provider] without the owner's session.
  # Empty = only the signed-in owner (the dashboard simulator) may deliver.
  CHANNEL_WEBHOOK_SECRET=""
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/server/business/channel-webhook.ts tests/server/business/channel-webhook.test.ts \
    "src/app/api/channels/webhook/[provider]/route.ts" scripts/verify-phase3.mjs .env.example
  git commit -m "feat(channels): accept provider-signed inbound webhooks"
  ```

**Completion contract:** RED unit and gate output read, GREEN unit and gate output read; the route's
owner path still passes Task 1's groups unchanged.

---

### Task 4: Docs, full verification, and the Phase 3 gate summary

**Why:** the repo's README is the source of truth for what is real; a new secret and a new gate must
be recorded there, and the whole phase re-proven in one pass.

**Files:**
- Modify: `README.md` (Run it block, API surface, real-vs-mocked row, acceptance checklist AT-10)
- Modify: `docs/ARCHITECTURE.md` (data-model idempotency note, trust-boundary row)
- Modify: `docs/superpowers/plans/2026-10-31-phase-3-channels.md` only if a ruling changed

- [ ] **Step 1: README**

  - Run it block: add `npm run verify:phase3 # boots the app and asserts the Phase 3 channel gate`.
  - API surface row for `POST /api/channels/webhook/[provider]`: `inbound edge with
    externalMessageId idempotency; owner session or x-channel-token`.
  - Real-vs-mocked row for webhook idempotency: `unique (businessId, externalMessageId)`; replay
    returns the same ticket with `duplicate: true`; a replay carrying another tenant's id creates this
    tenant's own ticket.
  - Add the provider token to the Configuration table: `CHANNEL_WEBHOOK_SECRET` → without it only the
    signed-in owner can deliver.
  - Acceptance checklist AT-10: `npm run verify:phase3` — "deliver twice → same ticketId, 4 events".

- [ ] **Step 2: ARCHITECTURE**

  - Data model `Ticket` row: `externalMessageId` **unique per business** = idempotency.
  - Trust boundaries: `x-channel-token` row — a provider token authorises delivery, not tenant
    listing; an unknown `businessId` is 404.
  - Built today: "idempotent webhooks (tenant-scoped)" and "provider-signed inbound edge".

- [ ] **Step 3: Full verification**

  Run in order and read each output:
  1. `npm test` → 0 fail.
  2. `npx tsc --noEmit` → exit 0.
  3. `npm run verify:phase3` → `PASS — N/N`.
  4. `npm run verify:phase1` → `PASS — N/N` (regression: the auth/landing/tenancy gate still holds).
  5. `npx next build` → exit 0; route table still lists the webhook and voice routes.

- [ ] **Step 4: Commit**

  ```bash
  git add README.md docs/ARCHITECTURE.md docs/superpowers/plans/2026-10-31-phase-3-channels.md
  git commit -m "docs(channels): record the Phase 3 gate and the provider token"
  ```

**Completion contract:** all five command outputs read; any failure is fixed in this task, not
narrated away.

---

## Gate summary — what "Phase 3 complete" means after Task 4

- Owner-simulated **and** provider-token-signed deliveries enter the same retrieval → routing →
  ticket + events path.
- The same `externalMessageId` twice creates exactly one ticket and one response; the same id under
  two tenants creates one ticket **per tenant** and never exposes the other's ticket.
- A `DRAFT_ONLY` channel holds a confident, cited answer at R5; only a human `approve_draft` sends it.
- An explicit human request escalates at R1; only a human `resolve` closes it.
- Readiness GETs tell the truth for `CONNECTED`, `TEST_MODE`, `DRAFT_ONLY`, `UNAVAILABLE`.
- Weekly sentiment + recurring complaints answer over HTTP.
- `npm test`, `npx tsc --noEmit`, `npm run verify:phase3`, `npm run verify:phase1`, `npx next build`
  are green in the same session.

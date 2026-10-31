# Team 41 — AfterSales AI

**PS 2.5 — AI Agent for Automated Customer Support and Ticket Triage** · SPHINX '26 (MNIT Jaipur)

> **Problem (verbatim):** Small businesses drown in repetitive support queries and miss urgent ones,
> while hiring support staff is expensive.
>
> **Approach (verbatim):** Agent that reads incoming emails or chats, classifies intent and urgency,
> drafts replies from a company knowledge base, and escalates sensitive cases to a human. Stack: LLM
> with tool calling, RAG over FAQs, a simple ticket dashboard.
>
> **Bonus twist:** Sentiment tracking and an automatic weekly insights report on recurring complaints.

AfterSales AI is that agent, built as one Next.js app: a landing page, a 4-step onboarding wizard that
compiles a versioned `business_brain.md`, and a 4-panel owner dashboard where every answer is grounded,
cited, and — when the machine is not sure — escalated instead of guessed.

---

## The rule that makes it a product

Seven rules, first match wins, evaluated in TypeScript **after** the classifier returns. The model
proposes four fields; the router disposes.

| Rule | Condition | Outcome |
|---|---|---|
| **R1** | the customer explicitly asks for a human | escalate |
| **R2** | `confidence < 50` **or** zero verified chunks cited | escalate |
| **R3** | distress, or a case requiring human judgment | escalate |
| **R4** | `urgency >= 80` | escalate |
| **R5** | the channel is draft-only | hold as draft, never send |
| **R6** | grounded, confident, not urgent | auto-reply |
| **R7** | classifier timeout, bad JSON, missing key | fail safe (`failed`, nothing sent) |

`confidence < 50` can never auto-send under any circumstance — that invariant is covered by tests and
by the live API, not by a prompt instruction.

---

## Run it

```bash
npm install          # app deps + both local services (best effort; never blocks the install)
npm run db:setup     # prisma db push + seed two businesses + 18 tickets
npm run dev          # app + Laya decision service + WhatsApp bridge
```

`npm run dev` starts all three in one terminal and prefixes their logs:

```text
AfterSales AI — dev stack
  web      http://localhost:3000
  laya     http://127.0.0.1:8100    typed decisions (advisory)
  baileys  http://127.0.0.1:3001    WhatsApp bridge
```

- It generates one shared secret per pair and hands it to both sides, so nothing has to be copied
  between `.env` files. Values already in `.env` win, and a non-local `LAYA_SERVICE_URL` or
  `BAILEYS_SERVICE_URL` is left alone (the app then talks to your deployed service instead).
- A busy port is not a failure: the app moves to the next free one and each service is re-pointed,
  including the bridge's callback URL. A service that is not installed, not supported here (Laya
  needs Apple silicon) or explicitly skipped says why and is left out — the app still runs.
- `Ctrl-C` stops all three.

`npm run setup` repeats the dependency and `.env` step on demand; it is idempotent and never
overwrites a value you set. `npm run setup -- --deps` does only the two services, `-- --env-only`
only the files.

Or the shortcuts:

```bash
npm run dev:web      # Next.js alone, as the verify scripts expect
npm run dev:services # only Laya + Baileys, against an app you started yourself
npm run dev -- --no-laya        # skip one service
npm run dev -- --no-baileys

npm test             # 410 tests, native runner, no test dependencies
npm run typecheck    # tsc --noEmit, strict + exactOptionalPropertyTypes
npm run build        # production build (see "Known limits" for the Windows prerender issue)
npm run env:check    # which keys are set / missing (never prints values)
npm run verify:hydration # headless Chrome: browser extensions cannot break hydration
npm run verify:phase1 # boots the app and asserts the Phase 1 gate over HTTP
npm run verify:phase3 # boots the app and asserts the Phase 3 channel gate over HTTP + DB
npm run verify:phase4 # boots the app and asserts the voice gate over HTTP + the DB
npm run verify:weekly # boots the app and asserts the automatic weekly report over HTTP + DB
npm run db:reset     # wipe and re-seed
```

### Upgrading an existing database

The Phase 3 idempotency key is `(businessId, externalMessageId)`, so an existing database drops a
unique index and adds a composite one. That is index-only DDL — no row is deleted — but `prisma db
push` warns and refuses it by default. Check that no duplicate pair exists, then accept the warning
explicitly:

```sql
SELECT "businessId", "externalMessageId", COUNT(*) FROM "Ticket"
WHERE "externalMessageId" IS NOT NULL
GROUP BY 1, 2 HAVING COUNT(*) > 1;          -- must return 0 rows
```

```bash
npx prisma db push --accept-data-loss   # drops the old unique index, adds the composite one
```

**Demo login:** the auth screen has a **1-Click Judge Demo Login** button. It signs you in as
`judge@demo.aftersales.ai`, which owns both seeded businesses (password `judge-demo-41` if you prefer
the form).

| Seeded tenant | What it is | Why it exists |
|---|---|---|
| `CloudPulse CRM` | B2B SaaS billing product | prices, plans, GST export, refund window |
| `Jaipur Smile Studio` | dental clinic | prices, hours, reschedule policy, aftercare |
| `Nimbus Billing` | owned by a **different** user | proves 403 tenant isolation (AT-05) |

---

## The bonus twist: sentiment tracking + the weekly report

Sentiment is tracked two ways from the same `Ticket.sentiment` rows:

- **Rolling** — a 0–100 index (`positive` 100 … `distressed` 0) over the last 7 days, compared with
  the 7 days before it, plus each day's negative share. It sits at the top of *Business brain & insights*.
- **Weekly** — one report per **completed ISO week** (Mon 00:00 UTC → next Mon 00:00 UTC), persisted in
  `WeeklyInsightReport` under a unique `(businessId, weekStart)`. It ranks recurring complaints
  (repeated **and** negative or escalated) with week-over-week deltas: `new`, `rising`, `cooling`,
  `steady`.

Both generation paths converge on the same row:

| Path | Trigger | Why it exists |
|---|---|---|
| `GET /api/businesses/[id]/insights` | first owner view after the week closes (`trigger: "lazy"`) | works with no scheduler configured |
| `GET\|POST /api/cron/weekly-insights` | `vercel.json`, Mondays 00:05 UTC, `Authorization: Bearer $CRON_SECRET` (`trigger: "cron"`) | runs with nobody watching |

A completed week is an immutable snapshot: a retried cron or a second read never duplicates the row or
moves `generatedAt`. The report is delivered in the dashboard and over the API; **email delivery is not
claimed** — the only mail transport here is the owner's connected Gmail. `npm run verify:weekly` boots
the app, seeds an isolated tenant with backdated tickets, and proves both paths, snapshot immutability and the dashboard surface against real rows.

---

## What is real vs what is mocked

**This table is the source of truth. A row may say REAL only if a test, an API call or a screenshot is
behind it.** Last verified: **2026-10-31 — `npm test` (410 tests), `npm run typecheck`,
`npm run build` and `npm run verify:weekly` (43/43, isolated database) on Node 26.5.0.
`npm run verify:phase3` reports 83/85 with `LLM_PROVIDER=heuristic` and `AUTH_SECRET` set: its trail
assertions still expect 4 events while the delivery path now writes a fifth (`DECISION_SHEET_*`) —
pre-existing on `main` and unrelated to the weekly report. The plain production build hits a Next.js
16.4.3 `/_global-error` crash on some machines (see "Known limits").**

| Capability | Status | What is behind it |
|---|---|---|
| R1–R7 routing engine, fail-safe ordering | **REAL** | 25 routing tests incl. the 49/50 boundary, urgency 80, R7 |
| Business brain: compile → chunk → cite | **REAL** | `src/server/ai/rag.ts`, chunk ids visible in the UI (`chk_cp_02` = pricing) |
| Business-scoped retrieval (BM25) | **REAL** | cross-tenant tests + live 403 on another owner's `businessId` |
| 4-step onboarding → versioned brain | **REAL** | `POST /api/businesses`, `PATCH …/brain` bumps `brainVersion` and re-chunks |
| Live queue + ticket drawer + event trail | **REAL** | append-only `TicketEvent` rows rendered per ticket |
| Approve draft / resolve escalation | **REAL** | human-only exits; the agent has no `escalated → replied` path |
| Webhook idempotency | **REAL** | unique `(businessId, externalMessageId)`; replay returns the same `ticketId` with `duplicate: true`, and the same id under another tenant is that tenant's own ticket |
| Provider-signed inbound edge | **REAL** | `x-channel-token` matching `CHANNEL_WEBHOOK_SECRET` delivers without a browser session; an unknown `businessId` is `404` |
| Sentiment trend + automatic weekly report | **REAL** | `weekly-report.ts` (30 engine tests), `weekly-report-store.ts` (12 store tests) and the display policy (3 tests): one report per completed ISO week, persisted idempotently on `(businessId, weekStart)` and never overwritten once written, generated lazily on first view and by the secret-gated weekly cron; `npm run verify:weekly` proves both paths on real rows (43 checks) |
| Voice session, PIN binding, mid-call retrieval, write-back | **REAL** | `start-session` → `sarvam-tool-search` → `sarvam-webhook` |
| Dynamic call context (hours, holidays, languages, FAQs) | **REAL** | owner-saved per business, resolved from the called number or agent id (shared secret), never from a caller-supplied business id |
| Availability and call-rule customizations | **REAL, REQUEST-ONLY** | weekly schedule + date overrides + temporary closures; appointment/cancellation/callback requests are queued for owner confirmation — no store, no fake calendar |
| LLM classifier | **CONDITIONAL** | OpenRouter when `OPENROUTER_API_KEY` is set; otherwise a labelled **offline** retrieval classifier |
| The offline classifier | **REAL, LABELLED** | BM25 coverage score, extractive answers. The dashboard shows a persistent banner and the API returns `degraded: true` |
| Sarvam telephone leg | **NOT PLACED HERE** | Needs `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT`. Without them the panel is an explicit dry run |
| Gmail connect / send / receive | **REAL, NOT LIVE-TESTED** | OAuth URL, token refresh, RFC 5322 MIME, thread headers, polling and duplicate suppression in `src/server/integrations/email.ts`, covered by unit tests with a fake `fetch`; no Google credentials existed in this environment |
| Meta Page / Instagram connect | **REAL, NOT LIVE-TESTED** | Facebook Login, short→long-lived Page token exchange, one-asset selection, encrypted storage, sends via `/{page-id}/messages`; signing and webhook HMAC tested; no Meta app existed in this environment |
| WhatsApp via local Baileys | **REAL, NOT LIVE-TESTED** | Backend client, QR/status polling, signed inbound and status webhooks; `baileys-service` has its own suite; needs the service and a phone (a tunnel only when this app is deployed) |
| Typed decision sheet via local Laya | **REAL, RUN LOCALLY** | `laya-service` (MLX, Apple silicon) answers 8 typed questions per message; the sheet is stored on the ticket and rendered next to the classifier's numbers; **advisory** — R1–R7 never reads it |
| Credential storage | **REAL** | AES-256-GCM vault over `ChannelConnection.configJson`, HMAC-signed OAuth state (10 min, tenant-bound); tamper/expiry/wrong-secret tests |
| Webhook authenticity | **REAL** | Meta `X-Hub-Signature-256` HMAC, Baileys shared secret, cron bearer secret — all rejected paths tested |
| Provider transports in this deployment | **NOT CONNECTED** | The inbound webhook contract is real and idempotent; no live Baileys/Meta/Google session runs in this deployment |
| Customers, orders, KB content | **SEEDED (by design)** | Retrieval is real; the corpus is authored sample content |
| Checkout links | **NOT BUILT** | No payment integration, no order mutation |

**Not claimed anywhere:** a trained model of our own, a provider handshake we exercised against a live
Gmail/Meta/WhatsApp account, a paid telephony leg in this deployment, payment processing, or customer
logins (only the owner logs in).

---

## Architecture (short version)

```
4 channels ──▶ channel adapters ──┐
                                  ├─▶ scoped BM25 retrieval ─▶ classifier (4 fields)
                                  │                              │
                                  │                              ▼
                                  │                    R1–R7 routing engine
                                  │                              │
                                  │            ┌─────────────────┼──────────────────┐
                                  │            ▼                 ▼                  ▼
                                  │        escalate          draft held         auto-reply
                                  ▼            │                 │                  │
                          tickets + append-only events ◀──────────┴──────────────────┘
                                  │
                                  │  (advisory, stored on the ticket — never read by R1–R7)
                                  │        ┌──────────────────────────────────┐
                                  │        │ laya-service :8100 (MLX, local) │
                                  │        │ urgent? · intent · frustration  │
                                  │        │ human asked? · sensitive? · …   │
                                  └───────▶└──────────────────────────────────┘
                                  │
                                  ▼
                        4-panel dashboard (+ insights)
```

Full diagrams, data model and trust boundaries: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Pages

| Route | What it is |
|---|---|
| `/` | The saved reference page (`public/landing`), served by a rewrite — the demo's front door. Its CTA opens `/auth` |
| `/home` | The app's own landing page (`src/app/home/page.tsx`), built from the Team 41 design deck — kept as the alternative front door |
| `/auth` | Sign in, create account, Continue with Google, 1-click judge demo |
| `/onboarding` | 4-step wizard, `.md` upload, the two seeded presets |
| `/dashboard` | Four panels: queue, voice, brain & insights, channels |
| `/landing` | The same saved reference as `/`, at its real path |

---

## API surface

| Route | Purpose |
|---|---|
| `POST /api/businesses` | save onboarding, compile brain + chunks (201) |
| `GET/PATCH /api/businesses/[id]/brain` | read chunks / edit markdown and bump the version |
| `GET/PATCH /api/businesses/[id]/tickets` | queue, one ticket with events, human actions |
| `GET /api/businesses/[id]/insights` | rolling sentiment trend + the persisted completed-week report (materialised lazily when missing) |
| `GET/POST /api/cron/weekly-insights` | secret-gated sweep that finalises the completed week for every business (Vercel Cron, Mondays 00:05 UTC) |
| `POST /api/ai/text-query` | text modal + queue responder (PRD §5.2 shape) |
| `POST /api/channels/webhook/[provider]` | inbound edge with tenant-scoped `externalMessageId` idempotency; owner session or `x-channel-token` |
| `GET /api/social/email/status`, `POST …/connect`, `POST …/disconnect` | Gmail link state, OAuth URL, revoke + clear |
| `GET /api/social/email/callback` | Google redirect target: verifies signed state, stores encrypted tokens |
| `GET /api/social/email/poll`, `POST …/send` | poll inbound mail (cron secret); send a draft as RFC 5322 MIME |
| `GET /api/social/meta/status`, `GET …/connect`, `GET …/callback` | Facebook Login round; 20-min encrypted pending selection |
| `GET /api/social/meta/assets`, `POST …/select-asset` | choose one Page or linked IG account; encrypted long-lived token |
| `POST /api/social/meta/disconnect`, `POST …/send` | clear one channel / send via `/{page-id}/messages` |
| `GET/POST /api/social/meta/webhook` | verification handshake and `X-Hub-Signature-256`-verified events |
| `POST /api/channels/whatsapp/connect`, `GET …/connection`, `POST …/disconnect` | owner-session QR pairing and state; no Baileys secret leaves the backend |
| `POST /api/channels/whatsapp/inbound`, `POST …/status` | Baileys-service callbacks, authenticated with `x-baileys-secret` |
| `POST /api/voice/start-session` | bind phone + 4-digit PIN to one business |
| `POST /api/voice/sarvam-tool-search` | per-business grounded facts mid-call |
| `POST /api/voice/sarvam-context` | on-start business context; resolves a tenant from `agentId`/`virtualNumber` behind a shared secret, or falls back to a session/PIN |
| `GET/PUT /api/businesses/[id]/voice-agent/context` | owner-saved call script, multiple-business mapping, active flag; core edits rebuild the brain |
| `GET/PUT /api/businesses/[id]/voice-agent/customizations` | owner-saved availability, appointment, cancellation/rescheduling, callback, urgent and business instructions |
| `POST /api/voice/sarvam-request` | mid-call appointment/reschedule/cancellation/callback capture → R5 draft ticket; always `confirmed: false` |
| `POST /api/voice/sarvam-webhook` | call completion → transcript, duration, queue ticket |
| `GET /api/health` | readiness |

Every route resolves `businessId` from the session and runs `loadOwnedBusiness()`; a foreign id is
`403`, never a filtered list. The one exception is a provider-token delivery, which names its own
business and gets a `404` for an unknown id.

---

## Configuration

**Setting up `.env` for the first time, or sending it to a teammate?** Follow the step-by-step guide
in [`docs/ENV-SETUP.md`](docs/ENV-SETUP.md) — where the file is, how to open it, how to prove it works,
and how to hand it over safely.

Copy `.env.example` to `.env`. Every key has a truthful degraded path, so an empty `.env` still runs.

| Key | Without it |
|---|---|
| `DATABASE_URL` | defaults to SQLite `prisma/dev.db` |
| `AUTH_SECRET` | dev uses an ephemeral secret (warns); **production refuses to boot** |
| `LLM_PROVIDER` | unset + no key ⇒ the labelled offline classifier |
| `OPENROUTER_API_KEY` | no model calls; a *failed* call with `LLM_PROVIDER=openrouter` becomes R7 |
| `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT` | the voice panel is an explicit dry run |
| `SARVAM_WEBHOOK_TOKEN` | the voice webhook only accepts the signed-in owner's session |
| `SARVAM_CONTEXT_TOKEN` | the context and request tools run without shared-secret auth (they say so in `warnings`); falls back to `SARVAM_WEBHOOK_TOKEN` |
| `CHANNEL_WEBHOOK_SECRET` | only the signed-in owner (the dashboard simulator) may deliver to a channel webhook |
| `INTEGRATION_ENCRYPTION_KEY` | provider connect/disconnect answers `503`; no credential is ever stored unencrypted |
| `INTEGRATION_STATE_SECRET` | falls back to `AUTH_SECRET`; without either, OAuth cannot start |
| `INTEGRATIONS_BASE_URL` | the request origin is used to build redirect URIs (fine locally, set it when tunnelled) |
| `EMAIL_GMAIL_CLIENT_ID` + `_SECRET` | the Gmail card reports itself unconfigured |
| `CRON_SECRET` | `GET /api/social/email/poll` and `/api/cron/weekly-insights` answer `503`; nothing polls or reports on a schedule |
| `META_APP_ID` + `META_APP_SECRET` | the Meta cards report themselves unconfigured |
| `META_WEBHOOK_VERIFY_TOKEN` | Meta's GET handshake fails closed |
| `BAILEYS_SERVICE_URL` + `BAILEYS_SERVICE_SECRET` | the WhatsApp card is unavailable; its callbacks stay `503` |
| `LAYA_SERVICE_URL` + `LAYA_SERVICE_SECRET` | no ticket carries a decision sheet; the drawer says the service is not configured |

`CHANNEL_WEBHOOK_SECRET` is a **platform** credential, not a tenant credential: a provider delivery
names its business, so one valid token can write to every tenant. Treat it like the database password
and hand it only to the adapter you operate. Per-business tokens are not built.

No secret is read in a client component. `.env` is gitignored; `.env.example` holds empty values only.

---

## Connected accounts (Gmail, Meta, WhatsApp)

The Channels panel has a **Connected accounts** area. Every card loads the backend's real state, stays
disabled while its configuration is missing, and only says *connected* after the provider reports an
open session. Credentials never reach the browser: OAuth runs in a popup or redirect, and the UI only
renders status fields (mailbox address, Page name, or the transient pairing QR).

### Gmail

1. Create a Google Cloud OAuth client (Web application) and register
   `<origin>/api/social/email/callback` as an authorized redirect URI.
2. Set `INTEGRATIONS_BASE_URL`, `EMAIL_GMAIL_CLIENT_ID`, `EMAIL_GMAIL_CLIENT_SECRET`, and
   `INTEGRATION_ENCRYPTION_KEY` (required before any provider can store credentials).
3. Connect from the dashboard and grant `gmail.modify`. The refresh token is encrypted at rest and
   access tokens are refreshed before they expire; only the mailbox address is shown back.
4. Schedule `GET /api/social/email/poll` with `Authorization: Bearer $CRON_SECRET`. Polling is used
   because Gmail push delivery needs a Google Cloud Pub/Sub setup this deployment does not include.
5. Disconnect asks Google to revoke the refresh token (best effort) and always clears the stored
   tokens.

### Facebook Page & Instagram

1. Create a Meta app, add Facebook Login plus the Messenger/Instagram products, and register
   `<origin>/api/social/meta/callback`.
2. Set `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and
   `INTEGRATION_ENCRYPTION_KEY`. Meta releases the scopes listed in `.env.example` only to apps that
   have passed App Review for them.
3. Point the Page webhook at `<origin>/api/social/meta/webhook` and the Instagram webhook at the app
   level. Every event is checked against `X-Hub-Signature-256` before it is parsed.
4. One authorization selects one asset — a Page (Messenger) or a linked Instagram account — valid for
   20 minutes and stored encrypted. Reconnect to switch assets; there is no "universal Meta key".
5. Sends use `POST /{page-id}/messages` for both Messenger and Instagram. Disconnect removes the
   Page subscription (`DELETE /{page-id}/subscribed_apps`), clears the stored token, and restores the
   channel's previous demo status.

### WhatsApp (Baileys)

Run both processes on one machine and no tunnel is involved: the app calls the service on
`http://localhost:3001`, and the service posts callbacks to `http://localhost:3000`. A tunnel is only
needed when this app is deployed and the service stays on your laptop.

1. Run the local service from `baileys-service/` (its README covers install, build, run and the QR
   flow) and set its `BAILEYS_SERVICE_SECRET` plus `VERCEL_BACKEND_URL` (or the two explicit webhook
   URLs). Locally that backend URL is `http://localhost:3000`.
2. In this app set the same `BAILEYS_SERVICE_SECRET` and `BAILEYS_SERVICE_URL`
   (`http://localhost:3001` locally, the tunnel origin when this app is deployed).
3. Connect from the dashboard. The backend opens the session and renders the QR the service returns;
   the QR is pairing material, is never persisted by this app, and disappears once connected.
4. The QR refreshes every ~20 s until the phone confirms, so a scan that misses one code simply uses
   the next one.
5. Only 1:1 text messages from other numbers are answered. Your own messages and group chats are
   ignored, and a grounded answer is auto-sent only under R6 — R1–R5 escalate or draft instead.
6. Baileys session files live in the service's gitignored `sessions/` folder. They never enter this
   app, the browser, or source control. Disconnect logs the phone out and drops the pairing; a bridge
   restart keeps the pairing and resumes it on the next **Connect WhatsApp** click.

### Typed decisions (Laya, advisory)

`laya-service/` runs Laya (`aac6fef/laya-typed-decisions-mlx`) on Apple silicon through MLX and asks
eight fixed questions about each inbound message: needs attention within the hour, a three-level
urgency, intent, a four-level frustration, whether a human was asked for, whether it is a sensitive
case, whether money was asked back, and churn risk.

1. Start it: `cd laya-service && uv sync --extra dev && uv run python -m laya_service` (its README
   covers install, the tunnel and the full HTTP contract). From the repository root, `npm run setup`
   installs it and `npm run dev` starts it — and the WhatsApp bridge — alongside the app, with the
   shared secrets generated for you.
2. In this app set `LAYA_SERVICE_URL` and `LAYA_SERVICE_SECRET` to the values in the service's `.env`.
3. New tickets get a decision sheet on the triage path (computed in parallel with the classifier) and
   the drawer shows it beside the classifier's numbers. In this environment it took 0.4–1.0 s per
   message; against a real OpenRouter call that is hidden, against the labelled offline classifier it
   is the slowest step of triage.

It is **advisory and stored**: the sheet is a column on the ticket plus a `DECISION_SHEET_COMPUTED`
(or `…_UNAVAILABLE`, with the reason) event, and R1–R7 keeps reading the classifier alone. A broken
or sleeping model costs a ticket its sheet, never its routing. The model card's own caveat is shown
rather than hidden: its confidence is uncalibrated, so the panel prints the number.

### What is not verified here

The integration code is unit-tested against fake HTTP boundaries (OAuth state, token refresh, MIME,
signature checks, duplicate suppression, disconnect clearing). No live Gmail mailbox, Meta app or
phone was available while building this, so the provider handshakes themselves are not claimed as
verified — and the cards only report what the backend actually measured.

---

## Acceptance checklist

| # | Claim | How it is proven here |
|---|---|---|
| AT-01 | landing → auth → onboarding/dashboard | live pages; `postAuthPath()` redirect rule |
| AT-02 | onboarding persists, compiles versioned chunks | `POST /api/businesses` → `brainVersion` + `chunkCount` |
| AT-03 | same question, per-business answers | Pro Plan under CloudPulse → ₹1,499 (R6); under the clinic → R2 escalate |
| AT-04 | voice personalisation per tenant | `npm run verify:phase4` — one phone, A answers ₹1,499 under R6, the clinic's same question escalates below 50 with no citation |
| AT-05 | strict tenant isolation | `POST /api/ai/text-query` with the third tenant → `403` |
| AT-06 | confidence 49 never sends | `tests/server/ai/routing.test.ts` (49 → R2, 50 + chunk → R6) |
| AT-07 | urgency ≥ 80 escalates | unit test + "urgent but grounded" chip in the text modal → R4 |
| AT-08 | explicit human request escalates | "Let me talk to a real human manager" → R1 |
| AT-09 | every auto-send cites a real chunk | cited ids filtered against that business's chunk set before routing |
| AT-10 | webhook replay is one ticket | `npm run verify:phase3` → deliver twice → same `ticketId`, `duplicate: true`, 4 events; the same id under two tenants → one ticket each |
| AT-11 | missing/broken classifier fails safe | `LLM_PROVIDER=openrouter` with no key → R7 `failed`, nothing sent |
| AT-12 | no secret reaches the client | secrets read only in route handlers / server components; `.env` gitignored |

Run `npm test` for AT-06…AT-11 as executable assertions; `npm run verify:phase3` for AT-05/AT-09/AT-10
plus the R5 draft hold and the human approve/resolve path; and `npm run verify:phase4` for the voice
half of AT-04/AT-05/AT-09 plus AT-12 (no Sarvam key in any rendered page).

---

## Known limits, stated plainly

1. **The offline classifier is not a language model.** Answers are extracted from the top BM25 chunks,
   so they read like your own KB sentences, not like prose. It exists so the routing contract is
   demonstrable without a key — and it is labelled on every screen that uses it.
2. **No telephony in this deployment.** The voice path is real up to the call: session, PIN, scoped
   retrieval and ticket write-back. The dial itself needs Sarvam credentials — without them the panel
   says **dry run** in the API response and on screen, and the last completed call (transcript,
   duration, outcome) is still read back from the database.
3. **Provider connections are implemented but not live-verified here.** Gmail, Meta and WhatsApp have
   real connect/disconnect/send/receive code and unit tests behind them; none was exercised against a
   live provider account in this environment. Without configuration the cards say so instead of
   pretending, and the legacy generic webhook stays available for scripted runs.
4. **The knowledge base is sample content we wrote.** The retrieval is real; the corpus is not a
   customer's.
5. **The legacy Pipecat/MCP design is superseded.** `docs/product/CAPABILITY.md` records what changed
   and why the PRD's rule table won.
6. **Production build is blocked on Windows by a Next.js 16.4.3 bug.** `npm run build` crashes while
   prerendering the synthetic `/_global-error` page (`Cannot read properties of null (reading
   'useContext')`). It reproduces on a stock two-file Next 16.4.3 app with this repo's `node_modules`,
   so it is not caused by this code; `next build --debug-prerender` completes and lists every route.
   Deployment is expected to build on Linux (Vercel); verify with `vercel build` before a live demo.

---

## Team

**Team 41** — Divyanshu Saini & Pulkit Khowal. Two people, one vertical slice, no half-features.

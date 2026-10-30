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
npm install
npm run db:setup     # prisma db push + seed two businesses + 18 tickets
npm run dev          # http://localhost:3000
```

Or the shortcuts:

```bash
npm test             # 120 tests, native runner, no test dependencies
npm run typecheck    # tsc --noEmit, strict + exactOptionalPropertyTypes
npm run build        # production build
npm run verify:phase1 # boots the app and asserts the Phase 1 gate over HTTP
npm run db:reset     # wipe and re-seed
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

## What is real vs what is mocked

**This table is the source of truth. A row may say REAL only if a test, an API call or a screenshot is
behind it.** Last verified: **2026-10-30, against a production build.**

| Capability | Status | What is behind it |
|---|---|---|
| R1–R7 routing engine, fail-safe ordering | **REAL** | 25 routing tests incl. the 49/50 boundary, urgency 80, R7 |
| Business brain: compile → chunk → cite | **REAL** | `src/server/ai/rag.ts`, chunk ids visible in the UI (`chk_cp_02` = pricing) |
| Business-scoped retrieval (BM25) | **REAL** | cross-tenant tests + live 403 on another owner's `businessId` |
| 4-step onboarding → versioned brain | **REAL** | `POST /api/businesses`, `PATCH …/brain` bumps `brainVersion` and re-chunks |
| Live queue + ticket drawer + event trail | **REAL** | append-only `TicketEvent` rows rendered per ticket |
| Approve draft / resolve escalation | **REAL** | human-only exits; the agent has no `escalated → replied` path |
| Webhook idempotency | **REAL** | unique `externalMessageId`; replay returns the same `ticketId` with `duplicate: true` |
| Weekly sentiment + recurring complaints | **REAL** | `src/server/business/insights.ts`, 9 aggregation tests |
| Voice session, PIN binding, mid-call retrieval, write-back | **REAL** | `start-session` → `sarvam-tool-search` → `sarvam-webhook` |
| LLM classifier | **CONDITIONAL** | OpenRouter when `OPENROUTER_API_KEY` is set; otherwise a labelled **offline** retrieval classifier |
| The offline classifier | **REAL, LABELLED** | BM25 coverage score, extractive answers. The dashboard shows a persistent banner and the API returns `degraded: true` |
| Sarvam telephone leg | **NOT PLACED HERE** | Needs `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT`. Without them the panel is an explicit dry run |
| WhatsApp / Instagram / Gmail transports | **SIMULATED** | The inbound webhook contract is real and idempotent; no live Baileys/Meta/Google session runs in this deployment |
| Customers, orders, KB content | **SEEDED (by design)** | Retrieval is real; the corpus is authored sample content |
| Checkout links | **NOT BUILT** | No payment integration, no order mutation |

**Not claimed anywhere:** a trained model of our own, a live WhatsApp/Meta/Google connection, a paid
telephony leg in this deployment, payment processing, or customer logins (only the owner logs in).

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
| `GET /api/businesses/[id]/insights` | weekly sentiment + recurring complaints |
| `POST /api/ai/text-query` | text modal + queue responder (PRD §5.2 shape) |
| `POST /api/channels/webhook/[provider]` | inbound edge with `externalMessageId` idempotency |
| `POST /api/voice/start-session` | bind phone + 4-digit PIN to one business |
| `POST /api/voice/sarvam-tool-search` | per-business grounded facts mid-call |
| `POST /api/voice/sarvam-context` | per-call variables for the voice agent |
| `POST /api/voice/sarvam-webhook` | call completion → transcript, duration, queue ticket |
| `GET /api/health` | readiness |

Every route resolves `businessId` from the session and runs `loadOwnedBusiness()`; a foreign id is
`403`, never a filtered list.

---

## Configuration

Copy `.env.example` to `.env`. Every key has a truthful degraded path, so an empty `.env` still runs.

| Key | Without it |
|---|---|
| `DATABASE_URL` | defaults to SQLite `prisma/dev.db` |
| `AUTH_SECRET` | dev uses an ephemeral secret (warns); **production refuses to boot** |
| `LLM_PROVIDER` | unset + no key ⇒ the labelled offline classifier |
| `OPENROUTER_API_KEY` | no model calls; a *failed* call with `LLM_PROVIDER=openrouter` becomes R7 |
| `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT` | the voice panel is an explicit dry run |
| `SARVAM_WEBHOOK_TOKEN` | the voice webhook only accepts the signed-in owner's session |

No secret is read in a client component. `.env` is gitignored; `.env.example` holds empty values only.

---

## Acceptance checklist

| # | Claim | How it is proven here |
|---|---|---|
| AT-01 | landing → auth → onboarding/dashboard | live pages; `postAuthPath()` redirect rule |
| AT-02 | onboarding persists, compiles versioned chunks | `POST /api/businesses` → `brainVersion` + `chunkCount` |
| AT-03 | same question, per-business answers | Pro Plan under CloudPulse → ₹1,499 (R6); under the clinic → R2 escalate |
| AT-04 | voice personalisation per tenant | two sessions on one number; A returns ₹1,499, B returns R2 escalation |
| AT-05 | strict tenant isolation | `POST /api/ai/text-query` with the third tenant → `403` |
| AT-06 | confidence 49 never sends | `tests/lib/routing-engine.test.ts` (49 → R2, 50 + chunk → R6) |
| AT-07 | urgency ≥ 80 escalates | unit test + "urgent but grounded" chip in the text modal → R4 |
| AT-08 | explicit human request escalates | "Let me talk to a real human manager" → R1 |
| AT-09 | every auto-send cites a real chunk | cited ids filtered against that business's chunk set before routing |
| AT-10 | webhook replay is one ticket | Channels panel → "Deliver twice" → `duplicate: true`, same `ticketId` |
| AT-11 | missing/broken classifier fails safe | `LLM_PROVIDER=openrouter` with no key → R7 `failed`, nothing sent |
| AT-12 | no secret reaches the client | secrets read only in route handlers / server components; `.env` gitignored |

Run `npm test` for AT-06…AT-11 as executable assertions.

---

## Known limits, stated plainly

1. **The offline classifier is not a language model.** Answers are extracted from the top BM25 chunks,
   so they read like your own KB sentences, not like prose. It exists so the routing contract is
   demonstrable without a key — and it is labelled on every screen that uses it.
2. **No telephony in this deployment.** The voice path is real up to the call: session, PIN, scoped
   retrieval and ticket write-back. The dial itself needs Sarvam credentials.
3. **Channel transports are simulated.** The webhook contract, idempotency and routing are real; the
   WhatsApp/Instagram/Gmail hops are not connected.
4. **The knowledge base is sample content we wrote.** The retrieval is real; the corpus is not a
   customer's.
5. **The legacy Pipecat/MCP design is superseded.** `docs/product/CAPABILITY.md` records what changed
   and why the PRD's rule table won.

---

## Team

**Team 41** — Divyanshu Saini & Pulkit Khowal. Two people, one vertical slice, no half-features.

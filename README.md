# aftersales

AfterSales AI — omnichannel AI support & triage for small businesses (SPHINX'26, PS 2.5, Team 41).

Full-stack Next.js (App Router, TypeScript) + Prisma. Phases 1–4 of the backend are complete:
multi-tenant onboarding, versioned Business Brain compilation, session auth, tenant-scoped APIs,
business-scoped RAG retrieval, LLM triage, deterministic R1–R7 routing with a hard confidence < 50
auto-send guard, idempotent WhatsApp/Instagram/Gmail inbound webhooks feeding the Live Queue, and a
Sarvam voice demo where per-call context and mid-call grounding are always resolved server-side.

## Getting started

```bash
git clone https://github.com/dishudhalwal12/aftersales.git
cd aftersales
npm install
cp .env.example .env   # then set AUTH_SECRET (and API keys when you have them)
npm run db:push        # create prisma/dev.db
npm run db:seed        # demo businesses, chunks, channels, 50 tickets
npm run dev            # http://localhost:3000
```

### Seeded demo accounts

| Account | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| Judge demo owner | `judge@sphinx.demo` | `demo1234` | Owns CloudPulse CRM + Jaipur Smile Studio |
| Rival owner | `rival@sphinx.demo` | `rival1234` | Owns no business (tenant-isolation tests) |

The auth page's **1-Click Judge Demo Login** uses the Auth.js `demo` provider and resolves to the
same demo account. New sign-ups start with no business and should be routed to `/onboarding`.

## Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Next.js dev server on `http://localhost:3000` |
| `npm run build` / `npm start` | Production build / start |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite against an isolated `prisma/test.db` (never touches `dev.db`) |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:seed` | Idempotent demo seed |
| `npm run db:reset` | Force-reset schema and reseed |
| `npm run db:studio` | Prisma Studio |

## Phase 1 API surface

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | DB + integration configuration checks (no secrets) |
| `POST` | `/api/auth/register` | Public | Email/password sign-up (`409` on duplicate email) |
| `*` | `/api/auth/[...nextauth]` | Public | Auth.js: email/password, judge demo, optional Google |
| `GET` | `/api/businesses` | Session | Businesses owned by the caller, with chunk/ticket counts and channels |
| `POST` | `/api/businesses` | Session | Onboarding save: compiles `business_brain.md`, chunks it, creates channel rows |
| `GET` | `/api/businesses/[id]/brain` | Session + ownership | Compiled brain markdown, version, and ordered chunks |
| `GET` | `/api/auth/session`, `/api/auth/csrf` | Public | Auth.js helpers used by the frontend |

## Phase 2 API surface

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/text-query` | Session + ownership | Runs RAG → LLM → R1–R7 routing, persists the ticket + timeline events, returns the triage result |
| `GET` | `/api/businesses/[id]/tickets` | Session + ownership | Tenant-scoped queue; `state`, `channel`, `limit` (1–100), `offset` |
| `GET` | `/api/businesses/[id]/insights` | Session + ownership | Windowed totals, sentiment/channel breakdowns, recurring complaints, daily trend (`days` 1–30, default 7) |

`POST /api/ai/text-query` request body:

```json
{
  "businessId": "biz_cloudpulse_01",
  "query": "What does the Starter plan cost?",
  "customerName": "Judge Tester",
  "customerHandle": "judge@sphinx.demo",
  "channel": "TEXT_MODAL"
}
```

The response carries `ticketId`, `specialist`, `intent`, `sentiment`, `urgencyScore`,
`confidenceScore`, `actionStatus`, `routingRuleHit`, `shouldAutoSend`, `answer`, and the grounding
`sources` (`chunkId`, `section`, `excerpt`). Without `OPENROUTER_API_KEY` the call still succeeds
with HTTP 200 but fails safe: `routingRuleHit: "R7"`, `actionStatus: "failed"`,
`shouldAutoSend: false`, and the ticket is logged so nothing is silently dropped.

## Phase 3 API surface

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/channels/webhook/[provider]` | Owner session or channel secret | `provider` is `whatsapp`, `instagram`, or `gmail` (case-insensitive). Runs RAG → routing → ticket/events with `externalMessageId` idempotency |

Request body (provider-neutral; the provider chooses only the channel, never the tenant):

```json
{
  "businessId": "biz_cloudpulse_01",
  "externalMessageId": "wamid.HBgM...",
  "customerName": "Rohit Sharma",
  "customerHandle": "+919812345678",
  "message": "What is the price of the Pro Plan?"
}
```

**Tenant mapping.** The dashboard's *Simulate Inbound Webhook* bar calls this route with the owner's
session cookie, and `businessId` must belong to that user (`403` otherwise). External providers call
it unauthenticated and must send `x-webhook-secret` (or `webhookSecret` in the body); the route
compares a SHA-256 of it against the channel row's `configJson.webhookSecretHash`, so the raw secret
is never stored. A missing or wrong secret returns `401` without revealing whether the business
exists. A channel with status `UNAVAILABLE` returns `409 CHANNEL_UNAVAILABLE`.

**Idempotency.** The first delivery creates the ticket and returns `201` with `duplicate: false`.
Every redelivery with the same `externalMessageId` is answered from the stored ticket (`200`,
`duplicate: true`, same `ticketId`, no second LLM call, no second ticket). Reusing an ID that belongs
to another business returns `409 MESSAGE_ID_CONFLICT`.

Channel status semantics: `CONNECTED`/`TEST_MODE` honour `autoSend`; `DRAFT_ONLY` always routes to
R5 (`actionStatus: "draft"`); `UNAVAILABLE` cannot receive webhooks at all.

Errors use one envelope: `{ "error": { "code", "message", "details?" } }`.
Unauthenticated → `401 UNAUTHORIZED`; another tenant's (or a non-existent) business → `403 FORBIDDEN`.

## Phase 4 API surface

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/voice/start-session` | Session + ownership | Records a `VoiceTestSession` (4-digit `demoPin`, 10-minute expiry) and places the Sarvam outbound call |
| `POST` | `/api/voice/sarvam-tool-search` | `x-sarvam-tool-secret` | Mid-call grounding: resolves the session, then returns that business's grounded facts |
| `POST` | `/api/voice/sarvam-webhook` | `x-sarvam-webhook-secret` | Stores transcript/duration/interaction ID; opens an escalation ticket when the call needs the owner |

`POST /api/voice/start-session` request and response:

```json
{ "businessId": "biz_cloudpulse_01", "judgePhone": "+919812345678" }
```

```json
{
  "sessionId": "vsess_...",
  "businessId": "biz_cloudpulse_01",
  "businessName": "CloudPulse CRM",
  "demoPin": "4821",
  "status": "initiated",
  "contextInjectionMode": "PER_CALL_VARIABLES"
}
```

The number must be an Indian E.164 mobile (`+91` + 10 digits starting 6–9) and the business's
`SARVAM_VOICE` channel must not be `UNAVAILABLE` (`409 CHANNEL_UNAVAILABLE`). Exactly four
variables travel with the call — `business_name`, `business_type`, `demo_pin`, `session_id` — and
never business facts, so one tenant's facts can never sit in the shared agent prompt. Without
`SARVAM_API_KEY`/`SARVAM_AGENT_ID` the session row is still created and marked `failed`, and the
route answers `503 SARVAM_NOT_CONFIGURED` (or `502 VOICE_PROVIDER_ERROR` with
`details: { sessionId, demoPin, status: "failed" }` when Sarvam rejects the call).

`POST /api/voice/sarvam-tool-search` request and response:

```json
{ "sessionId": "vsess_...", "query": "What is the Pro Plan pricing?" }
```

```json
{
  "businessName": "CloudPulse CRM",
  "groundedFacts": "CloudPulse offers two subscription plans. The Starter Plan costs ...",
  "citedChunkIds": ["chk_cp_02"],
  "confidenceScore": 92,
  "escalateToHuman": false
}
```

Send at least one of `sessionId`, `demoPin` (4 digits) or `callerPhone`; resolution order is
`sessionId` → `demoPin` → `callerPhone`, and only unexpired active sessions count, so the tenant is
always read from the session row. An unrecognised session returns `404 VOICE_SESSION_NOT_FOUND`.
Grounding runs `searchMarkdownRag(session.businessId, query, 4)` and only counts chunks whose own
content or keywords match the query — section headings such as "Products & Pricing" are shared
across businesses and never ground an answer on their own. Confidence combines the BM25 score curve
with query-term coverage; below 50 the response has `escalateToHuman: true`, no facts, and no
citations, so the agent hands off instead of guessing.

`POST /api/voice/sarvam-webhook` request and response:

```json
{
  "sessionId": "vsess_...",
  "status": "completed",
  "sarvamInteractionId": "call_...",
  "transcript": "I want to speak to a human about my subscription.",
  "durationSeconds": 87,
  "callerRequestedHuman": true
}
```

```json
{
  "sessionId": "vsess_...",
  "status": "completed",
  "escalationOutcome": "escalated_to_owner",
  "ticketId": "cm...",
  "duplicateTicket": false
}
```

`callerRequestedHuman: true` routes R1 and `resolved: false` routes R2; both create a `VOICE`
ticket in the Live Queue with three timeline events (`INBOUND_RECEIVED`, `ROUTING_DECIDED`,
`ESCALATED`). The ticket's `externalMessageId` is `voice_<sessionId>`, so a callback replay returns
the same `ticketId` with `duplicateTicket: true`. A `status: "failed"` callback records the session
without opening a ticket. Both voice secrets are compared in constant time against a SHA-256 digest;
an unset secret disables the route (`503 SARVAM_NOT_CONFIGURED`) and a wrong one returns `401`.

### Client sign-in calls

```ts
import { signIn } from "next-auth/react";

await signIn("demo", { callbackUrl: "/dashboard" });                       // judge demo
await signIn("credentials", { email, password, callbackUrl: "/dashboard" }); // email + password
```

## Architecture notes

- `prisma/schema.prisma` — PRD §3 schema; every tenant table is scoped by `businessId`.
- `src/lib/rag.ts` — Business Brain compiler + 150–300-word chunker + keyword extraction, plus
  `searchMarkdownRag(businessId, query, topK)` (BM25 + phrase/keyword boosts, light suffix stemming
  and price/cost synonym folding). The query is always hard-filtered by `businessId`, so one tenant
  can never retrieve another's chunks.
- `src/lib/llm-orchestrator.ts` — single-pass structured JSON call to an OpenRouter/OpenAI-compatible
  model (temperature 0, `response_format: json_object`, timeout, zod-validated). Throws
  `LLMError("NOT_CONFIGURED")` instead of fabricating an answer when the key is missing.
- `src/lib/routing-engine.ts` — PRD §4.3 R1–R7 evaluated in TypeScript, never by the model.
  Citations are verified against the business's real chunk IDs before R6 can auto-send, and
  confidence < 50 (or zero verified citations) always escalates under R2.
- `src/lib/triage.ts` — shared pipeline: retrieve → LLM → verify citations → route → persist
  `Ticket` + 4 `TicketEvent` rows. Reused by the text modal, channel webhooks, and later voice.
- `src/lib/channel-webhook.ts` — provider parsing, channel availability, hashed
  (`configJson.webhookSecretHash`) constant-time secret matching, and `externalMessageId`
  deduplication (pre-check plus the unique-constraint race). Replays an existing ticket instead of
  re-running the model.
- `src/lib/channels.ts` — `assertChannelAvailable(businessId, channelType)` shared by webhooks and
  voice sessions (`409 CHANNEL_UNAVAILABLE`).
- `src/lib/sarvam.ts` — voice session lifecycle: outbound call with whitelisted per-call variables,
  session resolution (session id → PIN → caller phone), deterministic grounding with a
  coverage-weighted confidence and escalation below 50, constant-time tool/webhook secrets, and
  completion handling that opens an idempotent R1/R2 escalation ticket.
- `src/lib/auth.ts` — Auth.js config, `requireUser()`, and `assertBusinessOwnership(userId, businessId)`.
- `src/lib/api.ts` — shared error envelope and JSON body parsing.
- `docs/spikes/SARVAM.md` — Sarvam per-call context spike (GREEN, conditional on live keys).
- `src/app/page.tsx` — temporary placeholder; the real landing page is the frontend track's Phase 1 task.

## Tests

`npm test` runs Vitest against a dedicated `prisma/test.db` created by `tests/global-setup.ts`
(`prisma db push --force-reset`), so your demo database is left untouched. Coverage includes:

- `tests/rag.test.ts` — cross-tenant isolation and ranking behaviour.
- `tests/routing.test.ts` — R1–R7 precedence, confidence 49 vs 50, foreign citation rejection.
- `tests/triage.test.ts` — end-to-end persistence via a fake LLM: R6 answer with citations,
  confidence 49 → R2, cross-tenant citation → R2, LLM failure → R7, draft-only channel → R5.
- `tests/channel-webhook.test.ts` — duplicate `externalMessageId` yields one ticket and no second
  LLM call, DRAFT_ONLY → R5, UNAVAILABLE → 409, cross-tenant ID reuse → 409, secret matching and
  provider parsing.
- `tests/sarvam.test.ts` — session resolution (id/PIN/phone, expiry, status, priority, 10-minute
  TTL), business-scoped grounding (answer with citation, other tenant escalates with no facts,
  multi-chunk answers, section-only matches rejected), the outbound payload (identity variables
  only), completion escalation tickets with replay dedup, and tool/webhook secret enforcement.

## Environment

See `.env.example`. `AUTH_SECRET`/`NEXTAUTH_SECRET` must be set (same value);
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional. `OPENROUTER_API_KEY` enables live LLM triage;
when it is blank the app stays in R7 fail-safe mode. `OPENROUTER_BASE_URL` and `LLM_TIMEOUT_MS`
are optional overrides.

Voice (Phase 4): `SARVAM_API_KEY` + `SARVAM_AGENT_ID` enable outbound calls, with optional
`SARVAM_VIRTUAL_NUMBER`, `SARVAM_API_BASE_URL`, `SARVAM_OUTBOUND_PATH` and `SARVAM_TIMEOUT_MS`.
`SARVAM_TOOL_SECRET` and `SARVAM_WEBHOOK_SECRET` guard the two Sarvam-facing routes; when either is
unset its route answers `503 SARVAM_NOT_CONFIGURED` rather than running unauthenticated.
`PUBLIC_WEBHOOK_BASE_URL` is the tunnel URL Sarvam can reach and is reported by `/api/health`.

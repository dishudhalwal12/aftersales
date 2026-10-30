# aftersales

AfterSales AI — omnichannel AI support & triage for small businesses (SPHINX'26, PS 2.5, Team 41).

Full-stack Next.js (App Router, TypeScript) + Prisma. Phases 1 and 2 of the backend are complete:
multi-tenant onboarding, versioned Business Brain compilation, session auth, tenant-scoped APIs,
business-scoped RAG retrieval, LLM triage, and deterministic R1–R7 routing with a hard
confidence < 50 auto-send guard.

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

Errors use one envelope: `{ "error": { "code", "message", "details?" } }`.
Unauthenticated → `401 UNAUTHORIZED`; another tenant's (or a non-existent) business → `403 FORBIDDEN`.

### Client sign-in calls

```ts
import { signIn } from "next-auth/react";

await signIn("demo", { callbackUrl: "/dashboard" });                       // judge demo
await signIn("credentials", { email, password, callbackUrl: "/dashboard" }); // email + password
```

## Architecture notes

- `prisma/schema.prisma` — PRD §3 schema; every tenant table is scoped by `businessId`.
- `src/lib/rag.ts` — Business Brain compiler + 150–300-word chunker + keyword extraction, plus
  `searchMarkdownRag(businessId, query, topK)` (BM25 + phrase/keyword boosts). The query is always
  hard-filtered by `businessId`, so one tenant can never retrieve another's chunks.
- `src/lib/llm-orchestrator.ts` — single-pass structured JSON call to an OpenRouter/OpenAI-compatible
  model (temperature 0, `response_format: json_object`, timeout, zod-validated). Throws
  `LLMError("NOT_CONFIGURED")` instead of fabricating an answer when the key is missing.
- `src/lib/routing-engine.ts` — PRD §4.3 R1–R7 evaluated in TypeScript, never by the model.
  Citations are verified against the business's real chunk IDs before R6 can auto-send, and
  confidence < 50 (or zero verified citations) always escalates under R2.
- `src/lib/triage.ts` — shared pipeline: retrieve → LLM → verify citations → route → persist
  `Ticket` + 4 `TicketEvent` rows. Reused by the text modal and later channel/voice phases.
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

## Environment

See `.env.example`. `AUTH_SECRET`/`NEXTAUTH_SECRET` must be set (same value);
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional. `OPENROUTER_API_KEY` enables live LLM triage;
when it is blank the app stays in R7 fail-safe mode. `OPENROUTER_BASE_URL` and `LLM_TIMEOUT_MS`
are optional overrides. Sarvam variables are used from Phase 4.

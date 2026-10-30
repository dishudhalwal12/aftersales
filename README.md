# aftersales

AfterSales AI — omnichannel AI support & triage for small businesses (SPHINX'26, PS 2.5, Team 41).

Full-stack Next.js (App Router, TypeScript) + Prisma. Phase 1 (backend) is complete:
multi-tenant onboarding, versioned Business Brain compilation, session auth, and tenant-scoped APIs.

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
- `src/lib/rag.ts` — Business Brain compiler + 150–300-word chunker + keyword extraction.
  Retrieval (`search_markdown_rag`) lands in Phase 2.
- `src/lib/auth.ts` — Auth.js config, `requireUser()`, and `assertBusinessOwnership(userId, businessId)`.
- `src/lib/api.ts` — shared error envelope and JSON body parsing.
- `docs/spikes/SARVAM.md` — Sarvam per-call context spike (GREEN, conditional on live keys).
- `src/app/page.tsx` — temporary placeholder; the real landing page is the frontend track's Phase 1 task.

## Environment

See `.env.example`. `AUTH_SECRET`/`NEXTAUTH_SECRET` must be set (same value);
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional; `OPENROUTER_API_KEY` is used from Phase 2;
Sarvam variables are used from Phase 4.

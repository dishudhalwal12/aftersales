# Plan — Phase 0 (runnable workspace) + Phase 1 (Foundation, Landing, Onboarding)

**Spec:** `docs/prd/ps_2_5_master_executable_prd_team_41.md` rev 4. §0 (agent rules), §1.2/§1.3
(design + routes), §3 (schema), §5.1 (businesses contract), §6 Phase 1 + its gate, §8 AT-01/AT-02/AT-05.

**Visual authority:** `docs/design/screens/` (18-screen deck, DESIGN REFERENCE · V1 · TEAM 41).
Slide 05 is `/`, slide 06 is `/auth`. Where the deck and PRD §1.2 disagree — the deck's six colours
(paper `#FFFFFF`, wash `#F4F4F1`, line `#E4E4DD`, ink `#0A0A0A`, petrol `#0E6B5F`, signal `#12A594`,
mint `#8FE0CE`) and its "no gradients, no glass, no shadow above 8%" rule versus the PRD's frosted
glass — the deck wins for the screens this plan builds or touches. Structure, routes, copy claims and
every frozen contract still come from the PRD.

"Phase 0" is not a PRD phase: it is the PRD §0 precondition — the repo must install, migrate, seed
and build before any phase can be called done. It is Task 1 and Task 2 here.

## Context

Repo state at branch point (`1668010`):

- `npx next build` fails: `Module not found: Can't resolve '@supabase/ssr'`.
- `npx prisma validate` fails: `Environment variable not found: DIRECT_URL`.
- `.env` says `DATABASE_URL="file:./dev.db"` while `prisma/schema.prisma` is `postgresql`.
- `/` is a `next.config.ts` rewrite to the borrowed static mirror `public/landing/index.html`
  ("AFTERSALES | Sales Digital Agency"). The PRD's own landing page does not exist.
- The one-click judge demo login was deleted in `09fb6ad`; AT-01 names it.
- Everything else Phase 1 asks for already exists and is covered by 120 passing tests.

## Global Constraints

- Frozen contracts: PRD §2 routes, §3 schema, §5.1 request/response. No renaming of routes or fields.
- `.env` is gitignored. No secret, key or password is committed; the demo account's password is
  already a published constant in `src/data/seed-facts.ts` and printed by the seed.
- Keep `provider = "postgresql"`. The Supabase cutover is deployed and intentional; local dev gets a
  local Postgres instead of reverting the schema (PRD §3 permits either).
- Commit style: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), no attribution
  trailer.
- Every verification claim is a command whose output was read in this session.

## Testing strategy (ruling, carried to the ledger)

- Logic: `npm test` — `node:test`, 120 tests, no DB, no network.
- HTTP + UI + DB: `node --env-file=.env scripts/verify-phase1.mjs` — boots `next dev` on a free port,
  asserts real responses, exits non-zero on the first failed group. This is the executable Phase 1
  gate: every UI/route claim must show up here, because the repo has no React test runner and adding
  one is out of scope.
- App: `npx next build`.

## Interfaces

| Producer | Consumer | Contract | Pre-flight finding |
|---|---|---|---|
| Task 2 (`.env`, seeded DB) | Task 4, Task 5, `npm run db:*` | `DATABASE_URL` + `DIRECT_URL` reachable; demo user `judge@demo.aftersales.ai`; businesses `biz_cloudpulse_01`, `biz_jaipursmile_02`, rival `biz_nimbus_03` | Task 5 asserts fixed IDs and doc verdicts — both come from `src/data/seed-facts.ts` and `seed.ts`; consistent |
| Task 3 (`/` page) | Task 5 (landing checks), Task 3 config | `/` renders the app's own page; `next.config.ts` keeps `/landing` reachable only | Task 3 removes the `/` rewrite that Task 5's landing assertions currently hit — ordered before Task 5, no conflict |
| Task 4 (`/api/auth/judge-demo`) | Task 5 (AT-01 dashboard redirect), Task 3 (authed CTA) | `POST` → 303 + `as_session` cookie → `/dashboard` for a user with a business | Task 4 imports `DEMO_EMAIL`/`DEMO_PASSWORD` from `src/data/seed-facts.ts`; Task 2 seeds exactly that user — consistent |
| Task 4 (session cookie) | Task 3 (authed landing CTA) | `SESSION_COOKIE = as_session`, HMAC-signed by `src/server/auth/crypto.ts` | Task 3 reads the session through `getCurrentUser()` only; no dependency on Task 4's route |

Pre-flight also checked: `scripts/verify-phase1.mjs` is new (no collision); `globals.css` already holds
the PRD §1.2 tokens, so landing CSS extends it rather than redefining them.

---

## Task 1 — Make the workspace buildable

**Why:** nothing can be verified until the dependency tree matches `package.json` after the pull.

**Files:** none tracked (node_modules is ignored). No commit.

1. RED — run `npx next build`.
   - Expected: exit non-zero, `Module not found: Can't resolve '@supabase/ssr'`.
2. `npm install`
   - Expected: exit 0; `postinstall` runs `prisma generate`; `node_modules/@supabase/ssr` now exists.
3. `rm -rf .next`
   - Removes the stale `validator.ts` that references a `src/app/page.tsx` which does not exist yet.
4. GREEN — `npx next build`.
   - Expected: exit 0; route table lists `/auth`, `/dashboard`, `/onboarding` and the API routes
     (`/api/health`, `/api/businesses`, `/api/businesses/[id]/brain|insights|tickets`,
     `/api/ai/text-query`, `/api/channels/webhook/[provider]`, `/api/voice/*`). No `/` yet.
5. `npm test`
   - Expected: `tests 120`, `pass 120`, `fail 0`.

**Completion contract:** both commands run, exit codes and counts read from the output.

---

## Task 2 — Local database, schema push, seed

**Why:** PRD §6 Phase 1 Dev B task 1 and the gate ("onboarding data persists") need a live database.
Local Postgres 18 is running on 5432; the schema is Postgres for the deployed Supabase config.

**Files:** `.env` (gitignored), `.env.example` (documented block).

1. RED — `npx prisma validate`.
   - Expected: exit 1, `Environment variable not found: DIRECT_URL`.
2. `createdb aftersales` (skip if it already exists).
   - Expected: exit 0 or `already exists`.
3. Edit `.env`:
   - `DATABASE_URL="postgresql://dishu@localhost:5432/aftersales?schema=public"`
   - `DIRECT_URL="postgresql://dishu@localhost:5432/aftersales?schema=public"`
   - Leave `AUTH_SECRET`, `LLM_PROVIDER=heuristic` and the rest untouched.
4. GREEN — `npx prisma validate`.
   - Expected: `The schema at prisma/schema.prisma is valid 🚀`, exit 0.
5. `npx prisma db push`.
   - Expected: "Your database is now in sync with your Prisma schema", exit 0.
6. `npm run db:seed`.
   - Expected: one line per seeded business (`CloudPulse CRM`, `Jaipur Smile Studio`, `Nimbus Billing`)
     and `Demo login: judge@demo.aftersales.ai / judge-demo-41`.
7. Count check: `node --env-file=.env -e` with PrismaClient → 2 users, 3 businesses, 18 tickets,
   ≥ 18 knowledge chunks.
   - Expected: printed counts match.
8. `.env.example`: add a short "Local Postgres" block above the Supabase block (same two variables,
   no credentials), so the next clone can reproduce step 3.
9. Commit: `docs(env): document a local Postgres database next to the Supabase poolers`.

**Completion contract:** validate/push/seed output read; counts printed; `.env` never staged.

---

## Task 3 — Build the landing page at `/` (PRD §1.2, §1.3, §6 Phase 1 Dev A task 1)

**Why:** the PRD's front door is the app's own page; today `/` is a borrowed agency site.

**Files:** `src/app/page.tsx` (new), `src/app/globals.css` (landing block), `next.config.ts`,
`scripts/verify-phase1.mjs` (new), `README.md`, `src/app/auth/page.tsx` (stale comment).

1. RED — write `scripts/verify-phase1.mjs` with only the landing group, then
   `node --env-file=.env scripts/verify-phase1.mjs`.
   - Script: spawn `next dev` on a free port, poll `GET /` until 200 (timeout 90 s), run checks,
     kill the child in `finally`, `process.exit(1)` on any failure.
   - Checks: `GET /` 200; body contains `data-page="landing"`, `id="how-it-works"`, `id="rules"`,
     `Your support queue, minus the guessing.`, `href="/auth"`, `Sign in`, `Get started`; body does
     **not** contain `Sales Digital Agency` and does **not** contain `Go to dashboard`.
   - Expected: FAIL on the first landing check (mirror is served).
2. Implement `src/app/page.tsx` (server component, `dynamic = "force-dynamic"`):
   - Slide 05 layout and the deck's six colours, declared on the page's own `.landing` scope (new
     `--paper/--wash/--line/--ink/--petrol/--signal/--mint` locals); no gradient, no glass, shadow
     ≤ 8%. Display type reuses the already-declared `LandingDisplay` / `LandingSerif` faces.
   - Nav: serif wordmark `AfterSales.`, anchors `How it works` → `#how-it-works`, `Rules` →
     `#rules`, `Features` → `#features`; right side is session-aware — signed out: ghost
     `Sign in` + black pill `Get started` (both `/auth`); signed in: black pill `Go to dashboard`
     (`/dashboard`). Session read wrapped in try/catch so a database outage still renders the page.
   - Hero (copy verbatim from slide 05): eyebrow `SPHINX '26 · PS 2.5`, serif h1 `Your support
     queue, minus the guessing.`, lede `Every inbound message read, answered from your own business
     facts, and escalated below confidence 50 — with the rule and the reason attached.`, buttons
     `Open the live demo` (`/dashboard`) and `Judge demo →` (`/auth#judge-demo`), micro-line
     `4 CHANNELS · 6 CHUNKS · 7 RULES`.
   - Hero stage (`data-video-slot`): 16:9 petrol card with concentric arc ornament and a footer
     strip. `existsSync(public/videos/hero-demo.mp4)` decides what renders: with the file, a real
     `<video controls>` plus the strip `hero-demo.mp4`; without it, deliberately no player and no
     fake play button — the petrol arcs are the preview and the strip says so. The PRD's
     "fallback animated preview" is the arcs, never a broken `<video>`.
   - Three step cards `01 Teach it your business`, `02 It triages every channel`, `03 You only see
     the unsure` (`id="how-it-works"`), then a compact `id="features"` architecture strip
     (4 channels → business brain → R1–R7 → queue) so the PRD's "live architecture preview" and the
     deck's `Features` link both resolve to something real.
   - `id="rules"` proof strip: `R2 — Confidence below 50 never auto-sends. It escalates, with the
     rule and the reason attached.` plus a `Read the rules` pill linking to `#rule-list`, and a
     compact R1–R7 list sourced from `RULE_REASONS` in `src/server/ai/routing.ts` (one source of
     truth, no re-typed rule text).
   - Footer: Team 41, PS 2.5. No claim of a connected channel.
3. `src/app/globals.css`: append a `/* ---------- landing ---------- */` block scoped under
   `.landing` (grid, hero stage arcs, step cards, rule strip, responsive collapse). The auth screen
   keeps its own block, but its two borrowed accents (`--auth-blue: #1811ff`, `--auth-pink:
#ff2974`) move to the deck's petrol/signal so `/` → `/auth` reads as one product.
4. `next.config.ts`: delete the `source: "/"` rewrite; keep `/landing` → `/landing/index.html` so the
   reference mirror stays reachable but is no longer the product.
5. `README.md`: route table row for `/` now describes our landing; note `/landing` is a reference
   snapshot, not the product. `src/app/auth/page.tsx`: update the comment that says `/` is the mirror.
6. GREEN — `node --env-file=.env scripts/verify-phase1.mjs` → landing group PASS.
7. `npx next build` → exit 0, route table now includes `ƒ /`.
8. Commit: `feat(landing): serve our own landing page at /`.

**Completion contract:** RED output read (mirror detected), GREEN output read (all landing checks
pass), build read, comments/docs updated in the same commit.

---

## Task 4 — Restore the one-click judge demo login (PRD §1.3 `/auth`, AT-01)

**Why:** the PRD names the button; the branch deleted it. `POST /api/auth/judge-demo` keeps it
curl-verifiable and JS-free (a form post), which is what the gate script can prove.

**Files:** `src/app/api/auth/judge-demo/route.ts` (new), `src/components/auth/AuthPanel.tsx`,
`scripts/verify-phase1.mjs`, `docs/AUTH.md`.

1. RED — extend the script with an `auth` group:
   - `POST /api/auth/judge-demo` → 303, `location` ends `/dashboard`, `set-cookie` contains
     `as_session=`.
   - `GET /dashboard` with that cookie → 200 and body contains `Live queue`.
   - `GET /` with that cookie → body contains `Go to dashboard` (Task 3's authed CTA).
   - `GET /auth` (no cookie) → 200 and body contains `1-click judge demo login`.
   - `GET /` with the judge cookie → 200, contains `Go to dashboard`, does not contain `Get started`.
   - Run → Expected: FAIL, `POST /api/auth/judge-demo` returns 404.
2. Implement the route:
   - `POST` only. Look up `DEMO_EMAIL` (import from `src/data/seed-facts.ts`); if the user is missing
     or `verifyPassword(DEMO_PASSWORD, user.passwordHash)` fails → `404` with the frozen error shape
     (`{ error: { code, message } }`), never a hint about which half failed.
   - `startSession(user.id)` then `303` to `postAuthPath(user.id)` (relative-to-absolute via
     `request.url`), so a fresh judge account lands on `/onboarding` and a seeded one on `/dashboard`.
   - `export const dynamic = "force-dynamic"`.
3. `AuthPanel.tsx`: below the Google button, the slide-06 panel — mint `#8FE0CE` ground, heading
   `1-click judge demo login`, line `Seeds CloudPulse CRM and Jaipur Smile Studio, then lands in the
   queue.`, and a petrol `Open →` submit inside a plain
   `<form method="post" action="/api/auth/judge-demo">` (no client JS). The panel carries
   `id="judge-demo"` so the landing's `Judge demo →` link lands on it.
4. `docs/AUTH.md`: one paragraph — the demo route exists, what it signs in, and that it only works
   when the seed ran.
5. GREEN — script `auth` group PASS; `npm test` 120/120; `npx next build` exit 0.
6. Commit: `feat(auth): restore the one-click judge demo login`.

**Completion contract:** 404 watched first, 303 + cookie + `/dashboard` watched after, suite green.

---

## Task 5 — Prove the rest of the Phase 1 gate (AT-01 second half, AT-02, AT-05, contracts, Sarvam doc)

**Why:** the PRD gate is a list of claims. Everything except the landing page and demo login already
exists, so this task builds the harness that proves it — and fixes whatever it exposes.

**Files:** `scripts/verify-phase1.mjs`, plus any file a failing check implicates.

1. Extend the script with the remaining groups (all read via HTTP or the DB):
   - **health:** `GET /api/health` → 200, `ok: true`/`status` field per `src/app/api/health/route.ts`.
   - **contracts (AT-02):** `POST /api/businesses` with the judge cookie and the PRD §5.1 payload →
     201, `brainVersion: 1`, `chunkCount > 0`; then `GET /api/businesses/{id}/brain` → chunk ids all
     start `chk_`; a second identical `GET` returns the same chunk count (persistence across
     requests). Record the created id for cleanup.
   - **tenancy (AT-05):** judge cookie + `GET /api/businesses/biz_nimbus_03/brain` → 403; a session
     forged for the rival user (`signSessionToken` from `src/server/auth/crypto.ts`, no Next imports)
     + the same URL → 200.
   - **redirect (AT-01):** create a user row with no business (Prisma + `hashPassword`), forge its
     session cookie, `GET /dashboard` with `redirect: "manual"` → 307/302 with `location: /onboarding`.
   - **surface:** `GET /dashboard?tab=queue` with the judge cookie → 200 and the four tab labels
     (`Live queue`, `Voice test`, `Business brain`, `Channels`).
   - **session-aware landing:** `GET /` signed out → contains `Get started`; with the judge cookie →
     contains `Go to dashboard` and not `Get started`.
   - **docs:** `docs/spikes/SARVAM.md` contains `Verdict` and `GREEN` (PRD §6 Phase 1 Gate).
   - **cleanup:** delete the created business, its chunks, and the fresh user in `finally`.
2. Run the full script.
   - Expected: every group PASS. A failing check is a bug: reproduce it, fix the implicated file,
     re-run. No assertion is loosened to make it pass.
3. `npm test` → 120/120; `npx next build` → exit 0.
4. Commit: `test(phase1): add the executable Phase 1 gate`.

**Completion contract:** full script output read with all groups PASS, suite green, build green.
If every check passes on the first run, the task's deliverable is the harness and the ledger records
"verification-only task, no production code changed".

---

## Gate summary (what "Phase 1 complete" means after Task 5)

- `/` renders the app's own landing page with the hero video slot and no borrowed branding.
- Sign-in redirects to `/onboarding` (no business) or `/dashboard` (seeded demo, one click).
- Onboarding POST persists and compiles versioned chunks; brain GET returns them after reload.
- Cross-tenant reads return 403; the rival reads their own business.
- `docs/spikes/SARVAM.md` carries an explicit GREEN/RED verdict.
- `npm test`, `npx next build`, and the gate script are green in the same session.

## Review Focus

- Landing page: whether the authed CTA can leak a session state to a signed-out visitor, and whether
  the hero fallback ever renders a broken `<video>`.
- Demo login: whether the route can be abused to reach a non-demo account, and whether it leaks which
  half of the credential check failed.
- Gate script: whether cleanup runs when an assertion throws mid-group.

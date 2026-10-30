# aftersales

AfterSales AI — omnichannel AI support & triage for small businesses (SPHINX'26, PS 2.5, Team 41).

Full-stack Next.js (App Router, TypeScript) + Prisma. Phases 1–4 of the backend are complete:
multi-tenant onboarding, versioned Business Brain compilation, session auth, tenant-scoped APIs,
business-scoped RAG retrieval, LLM triage, deterministic R1–R7 routing with a hard confidence < 50
auto-send guard, idempotent WhatsApp/Instagram/Gmail inbound webhooks feeding the Live Queue, and a
Sarvam voice demo where per-call context and mid-call grounding are always resolved server-side.
A separate local Baileys service (see [`baileys-service/`](baileys-service/README.md)) adds real
WhatsApp messaging without changing the frontend, schema, or AI pipeline. Business owners can also
connect **Gmail** (OAuth, polling, in-thread replies) and **Meta** (Facebook Page Messenger and
linked Instagram professional accounts) through `/api/social/*`; both feed the same triage pipeline.

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

## WhatsApp integration (local Baileys service)

Real WhatsApp connectivity lives in a separate, standalone service under
[`baileys-service/`](baileys-service/README.md) (Node.js + TypeScript + Baileys, port 3001). It owns
every WhatsApp socket and every Baileys credential; this Next.js app still owns tenants, tickets,
RAG, and routing. The frontend never talks to the service and never sees session files.

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/channels/whatsapp/connect` | Session + ownership | Reuses or mints the business's `wa_...` connection id, opens the local socket, persists the snapshot, returns the QR data URL |
| `GET` | `/api/channels/whatsapp/connection?businessId=...` | Session + ownership | Polls status/QR for the dashboard (`404 WHATSAPP_NOT_CONNECTED`, `409 WHATSAPP_RECONNECT_REQUIRED` after a service restart) |
| `POST` | `/api/channels/whatsapp/disconnect` | Session + ownership | `{ businessId, logout? }`; logout defaults to `true` and removes the stored session on the service |
| `POST` | `/api/channels/whatsapp/inbound` | `x-baileys-secret` | Service → backend: one incoming text message; runs the existing triage pipeline and auto-replies through the service when routing allows |
| `POST` | `/api/channels/whatsapp/status` | `x-baileys-secret` | Service → backend: `connected`/`disconnected`/`logged_out` transitions |

Connection metadata (connection id, last status, phone number, timestamps) is stored in the existing
`ChannelConnection.configJson`, so no schema migration is needed. A channel flips to `CONNECTED` only
on a real `connected` event; on disconnect or logout it returns to its previous demo mode
(`TEST_MODE`/`DRAFT_ONLY`). Inbound messages reuse the Phase 3 pipeline: tenant resolved from the
connection id, `externalMessageId` idempotency, and a reply only when `shouldAutoSend` is true.

Configure the backend with `BAILEYS_SERVICE_URL`, `BAILEYS_SERVICE_SECRET`, and optionally
`BAILEYS_TIMEOUT_MS`. Locally, `BAILEYS_SERVICE_URL=http://localhost:3001` works; on a Vercel
deployment expose the service through a tunnel (the service reaches Vercel directly, but Vercel
cannot reach your laptop). Full onboarding, API, security, and troubleshooting documentation is in
[`baileys-service/README.md`](baileys-service/README.md).

## Email and Meta integrations

Business owners connect Gmail and Meta from onboarding. The integrations are separate modules under
`src/lib/email.ts` and `src/lib/meta.ts`; they normalize incoming messages and call the existing
`handleInboundWebhook` → `triageInboundMessage` pipeline. The AI agent is not duplicated and has no
provider-specific code. Replies are sent only when the existing routing decision returns
`shouldAutoSend` **and** the channel is connected to that business.

### Onboarding UI contract

This repository contains no onboarding UI (the frontend is a separate track; `src/app/page.tsx` is a
placeholder). The cards should be driven entirely by the status endpoints — never render `Connected`
before the backend reports it:

| Card | Status source | Connected when |
| :--- | :--- | :--- |
| Email | `GET /api/social/email/status?businessId=...` | `connected: true` (and `status: "connected"`) |
| Facebook Page | `GET /api/social/meta/status?businessId=...` → `facebook` | `facebook.connected: true` |
| Instagram | same response → `instagram` | `instagram.connected: true` |

Both status responses include `status: "connected" | "disconnected" | "error"` and a `lastError`
string when a provider call failed. They never include tokens, client secrets, or encrypted values.
The Connect buttons call `POST /api/social/email/connect` or navigate to
`GET /api/social/meta/connect?businessId=...`; Disconnect calls the matching `/disconnect` route.
Meta needs one extra step after OAuth: the backend returns `pending_selection`, the frontend lists
`GET /api/social/meta/assets` and posts the chosen asset to `POST /api/social/meta/select-asset`.

### Architecture

| Module | Role |
| :--- | :--- |
| `src/lib/integration-crypto.ts` | AES-256-GCM credential vault (`INTEGRATION_ENCRYPTION_KEY`) and HMAC-signed, 10-minute OAuth state bound to provider + business + user + redirect URI |
| `src/lib/integrations.ts` | `INTEGRATIONS_BASE_URL` resolution and optional frontend redirect |
| `src/lib/cron.ts` | Constant-time `CRON_SECRET` check for background jobs |
| `src/lib/channels.ts` | `configJson` readers/writers, `ensureChannelConnection` (handles rows created before `FACEBOOK` existed), error markers |
| `src/lib/social-message.ts` | Provider-independent normalized message shape handed to triage |
| `src/lib/email.ts` | Gmail OAuth, refresh, MIME send/reply, unread polling, inbound processing, status, disconnect |
| `src/lib/meta.ts` | Meta OAuth, long-lived token, Page/IG asset discovery, pending selection, Page subscription, webhook signature + parsing, Messenger/IG send, status, disconnect |
| `src/lib/oauth-redirect.ts` | OAuth callback response (configured frontend redirect or JSON) |

Nothing is added to the Prisma schema. Connections reuse `ChannelConnection.configJson` under the
keys `email`, `metaPending`, `metaConnection`, `emailLastError`, and `metaLastError`. The only
string-level activation is the new `FACEBOOK` channel type; `ensureChannelConnection` creates that
row on demand for businesses created before it existed. A successful connection sets the channel to
`CONNECTED` with `autoSend: true`; disconnect restores the previous mode (for example `DRAFT_ONLY`
or `UNAVAILABLE`) and clears the encrypted credentials.

### Email (Gmail API)

Gmail is the only implemented email provider. Other providers are rejected explicitly instead of
being faked: `EMAIL_PROVIDER` values other than `gmail` return `400 EMAIL_PROVIDER_NOT_SUPPORTED`, and
`POST /api/social/email/credentials` returns `400 EMAIL_OAUTH_REQUIRED` for Gmail (the app never asks
for a mailbox password).

**Provider setup**

1. Create/select a Google Cloud project and enable the **Gmail API**.
2. Configure the OAuth consent screen (External is fine for testing). While the app is unverified,
   add the owner's Google account under **Test users**.
3. Create an **OAuth client ID** of type *Web application* with the redirect URI
   `{INTEGRATIONS_BASE_URL}/api/social/email/callback` (local:
   `http://localhost:3000/api/social/email/callback`).
4. Put the client ID/secret in `EMAIL_GMAIL_CLIENT_ID` / `EMAIL_GMAIL_CLIENT_SECRET` (or reuse
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, which are used as a fallback).
5. Set `INTEGRATION_ENCRYPTION_KEY` (32 random bytes, base64 or 64 hex) and
   `INTEGRATION_STATE_SECRET` (or `AUTH_SECRET`). The backend refuses to store a connection without
   them.

**Permissions:** the integration requests only
`https://www.googleapis.com/auth/gmail.modify` — read, compose, send, and mark-as-read. Gmail
classifies this as a restricted scope; a public production app needs Google OAuth verification (and
may need a security assessment). Testing with Test users does not.

**Message flow:** the backend polls unread mail (`is:unread -from:me -in:chats`), skips the
business's own address and `SENT` mail, extracts sender/subject/plain-text body/thread headers, hands
the normalized message to triage, sends the answer as a MIME reply with `threadId`, `In-Reply-To`,
and `References`, then marks the message read. `externalMessageId` is `gmail:<message-id>`, so a
replayed poll cannot create a second ticket or a second reply.

**Gmail push:** Gmail cannot push to an arbitrary URL — it requires Google Cloud Pub/Sub. This
deployment therefore honest-polls. `POST /api/social/email/webhook` returns
`501 EMAIL_WEBHOOK_NOT_SUPPORTED`; configure a scheduler to call the poll route instead.

**Polling:** `GET` (or `POST`) `/api/social/email/poll` with
`Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`). Unset `CRON_SECRET` disables it with
`503 CRON_NOT_CONFIGURED`.

### Meta (Facebook Page Messenger + Instagram professional accounts)

Meta has no universal API key. The flow uses Facebook Login, a long-lived user token exchanged for
Page tokens, and an explicit owner selection.

**Permissions requested:** `pages_show_list`, `pages_messaging`, `pages_manage_metadata`,
`instagram_basic`, `instagram_manage_messages`. Nothing else.

**Meta app setup**

1. Create an app at [developers.facebook.com](https://developers.facebook.com) (type *Business*).
2. Add the **Facebook Login** product and register
   `{INTEGRATIONS_BASE_URL}/api/social/meta/callback` as a valid OAuth redirect URI.
3. Add **Messenger** → *Facebook Page* and **Instagram** → *Instagram API setup with Facebook Login*
   (the Page-linked Instagram messaging flow).
4. Set `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default `v26.0`), and a random
   `META_WEBHOOK_VERIFY_TOKEN`.
5. Webhooks: callback URL `{INTEGRATIONS_BASE_URL}/api/social/meta/webhook`, verify token as above.
   Subscribe the **Page** object to `messages` and `messaging_postbacks`. For Instagram, subscribe the
   **Instagram** object to `messages` in the app dashboard — Meta does not allow Instagram webhooks to
   be configured through the Page `subscribed_fields` API, so the backend only attaches the Page to
   the app for that case.
6. The owner must manage the Page and, for Instagram, the professional account must be linked to that
   Page. Personal Facebook/Instagram accounts cannot use these messaging APIs.
7. In **Development mode**, only app admins/developers/testers can authorize and receive events.
   `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, and `instagram_manage_messages`
   require **Advanced Access** (App Review) and usually **Business Verification** before non-testers
   can connect in production. Development-mode limitations are a Meta platform rule, not a backend
   switch.

**Flow:** `GET /api/social/meta/connect?businessId=...` redirects to the Meta dialog with signed
state. The callback exchanges the code for a long-lived token, fetches `/me/accounts` with each
Page's linked `instagram_business_account`, and stores a 20-minute encrypted pending selection. The
owner then lists `GET /api/social/meta/assets` and posts
`{ businessId, kind: "page" | "instagram", assetId }` to `POST /api/social/meta/select-asset`.
The backend checks the asset really came from that authorization, subscribes the Page, and only then
marks the matching channel (`FACEBOOK` or `INSTAGRAM`) connected. One OAuth round connects one asset;
repeat the flow to connect both.

**Receiving/sending:** Page webhooks (`object: "page"`) and Instagram webhooks
(`object: "instagram"`) are verified with `X-Hub-Signature-256` HMAC (`META_APP_SECRET`). Echoes,
non-text events, and events for unconnected assets are acknowledged and ignored. Replies use
`POST /{page-id}/messages` with the stored Page token (the same Page endpoint serves Page-linked
Instagram messaging). `externalMessageId` is `meta:<object>:<mid>`, which deduplicates Meta retries.
A Graph error code 190 clears the credentials and reports `META_RECONNECT_REQUIRED`.

**WhatsApp Cloud API:** not implemented here. The separate Baileys service remains the WhatsApp path.

### API surface

| Method | Route | Auth | Notes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/social/email/connect` | Session + ownership | `{ businessId }` → `{ provider: "gmail", method: "oauth", authorizationUrl, redirectUri }` |
| `GET` | `/api/social/email/callback` | Signed state | Google → backend; stores encrypted tokens and marks the channel connected |
| `POST` | `/api/social/email/credentials` | Session + ownership | Reserved for API-key providers; Gmail returns `EMAIL_OAUTH_REQUIRED` |
| `GET` | `/api/social/email/status?businessId=` | Session + ownership | Connection state, address, scopes, `lastError`; no tokens |
| `POST` | `/api/social/email/disconnect` | Session + ownership | `{ businessId }`; revokes the token best-effort and clears credentials |
| `POST` | `/api/social/email/webhook` | — | `501` by design (Gmail needs Pub/Sub; use polling) |
| `POST` | `/api/social/email/send` | Session + ownership | `{ businessId, to, subject, text, threadId?, inReplyTo?, references? }` |
| `GET`/`POST` | `/api/social/email/poll` | `CRON_SECRET` | Polls all connected mailboxes and processes them |
| `GET` | `/api/social/meta/connect?businessId=` | Session + ownership | `302` to Meta's OAuth dialog |
| `GET` | `/api/social/meta/callback` | Signed state | Stores a pending Page/IG selection (`pending_selection`) |
| `GET` | `/api/social/meta/assets?businessId=` | Session + ownership | Sanitized Page + linked Instagram assets, 20-minute expiry |
| `POST` | `/api/social/meta/select-asset` | Session + ownership | `{ businessId, kind, assetId }`; verifies access + subscribes the Page |
| `GET` | `/api/social/meta/status?businessId=` | Session + ownership | Per-channel state, pending selection, `lastError` |
| `POST` | `/api/social/meta/disconnect` | Session + ownership | `{ businessId, channel?: "facebook" | "instagram" | "all" }` |
| `GET` | `/api/social/meta/webhook` | Verify token | Meta webhook handshake |
| `POST` | `/api/social/meta/webhook` | `X-Hub-Signature-256` | Messenger/Instagram events; dedupe + auto-reply |
| `POST` | `/api/social/meta/send` | Session + ownership | `{ businessId, channel, recipientId, text }` (testing/manual send) |

### Security notes

- Provider tokens are AES-256-GCM encrypted before storage; responses never include them. Logs never
  include tokens, client secrets, or authorization URLs with secrets.
- OAuth state is HMAC-signed, expires in 10 minutes, and is bound to provider, business, user, and
  redirect URI. Callbacks re-check business ownership from the database.
- Webhooks: Meta uses HMAC `X-Hub-Signature-256`; WhatsApp service routes use a shared secret. All
  comparisons are constant-time.
- Business ownership is checked on every management route before any connection is read or written.
- Disconnect revokes the Gmail refresh token where Google accepts it and clears all encrypted
  material. Meta clears the Page token and unsubscribes the Page when disconnecting `all`.
- `INTEGRATION_ENCRYPTION_KEY` rotation makes existing connections unreadable by design; owners must
  reconnect. Never commit real secrets.

### Running locally

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # INTEGRATION_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # INTEGRATION_STATE_SECRET
npm run db:push
npm run db:seed        # optional demo data
npm run dev
```

Sign in at `/auth` (demo or your account), sign in, then call the routes with the session cookie — the
easiest path is the browser console on the same origin:

```ts
await fetch("/api/social/email/status?businessId=YOUR_ID").then((r) => r.json());
await fetch("/api/social/email/connect", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ businessId: "YOUR_ID" }),
}).then((r) => r.json()); // open authorizationUrl in the same browser
```

Meta:

```ts
window.location.href = "/api/social/meta/connect?businessId=YOUR_ID";
// after the callback: GET /api/social/meta/assets?businessId=YOUR_ID
// then POST /api/social/meta/select-asset with { businessId, kind: "page", assetId }
```

Email polling:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/social/email/poll
```

To test inbound mail, send a message from another address to the connected mailbox and run the poll
route; the reply should appear in the same thread. To test Meta locally, expose the backend with a
tunnel (Meta requires a public HTTPS callback), complete the connect flow, then message the Page or
Instagram account from a tester account.

### Deployment (Vercel)

1. Set every variable above in the Vercel project (Production and Preview as needed).
2. Set `INTEGRATIONS_BASE_URL` to the deployment URL and register the Email and Meta callback URLs
   with Google/Meta.
3. Apply the schema as usual (`prisma db push` or your migration workflow). No new tables are needed.
4. Schedule email polling. Example `vercel.json`:

```json
{
  "crons": [{ "path": "/api/social/email/poll", "schedule": "*/5 * * * *" }]
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Cron frequency depends on the plan
(Hobby allows daily cron; use an external scheduler for minute-level polling if needed).
5. Register `https://<deployment>/api/social/meta/webhook` as the Meta webhook and subscribe the Page
   to `messages`/`messaging_postbacks` and the Instagram object to `messages`.

### Troubleshooting

| Symptom | Likely cause / fix |
| :--- | :--- |
| `EMAIL_NOT_CONFIGURED` / `META_NOT_CONFIGURED` | Provider env vars missing in this deployment; set them and redeploy. |
| `INTEGRATION_ENCRYPTION_NOT_CONFIGURED` | `INTEGRATION_ENCRYPTION_KEY` missing or not 32 bytes (base64/hex). |
| Invalid API key / client secret | Gmail client secret wrong or the OAuth client belongs to another project; Meta secret wrong. Rotate and retry. |
| OAuth authorization failure / `EMAIL_OAUTH_DENIED` / `META_OAUTH_DENIED` | Owner cancelled, test user not added (Google), or app not in Development testers (Meta). Retry after fixing access. |
| `OAUTH_STATE_EXPIRED` / `OAUTH_STATE_INVALID` | Took longer than 10 minutes, backend restarted with a different state secret, or the callback URL was edited. Start again. |
| Token expiration / `EMAIL_RECONNECT_REQUIRED` / `META_RECONNECT_REQUIRED` | Refresh token revoked or Page token invalid (Graph code 190). The backend clears credentials; reconnect and check provider permissions. |
| Missing permissions / `META_ASSET_NOT_AVAILABLE` / `META_NO_ASSETS` | The owner did not grant the requested scopes, does not manage the Page, or the IG account is not linked. Reconnect and grant all requested permissions. |
| Webhook verification failure | `META_WEBHOOK_VERIFY_TOKEN` differs from the dashboard, or the callback URL is wrong/not HTTPS. |
| `META_SIGNATURE_INVALID` | `META_APP_SECRET` differs from the app that signs the webhook, or a proxy altered the raw body. |
| Email not received | Poll job not scheduled / `CRON_SECRET` mismatch; Gmail API not enabled; message already read; filters (`-from:me`) exclude it. Check the poll response and server logs. |
| Email not sent | Gmail scope missing, token expired, or sending limit/verification issue. Check `lastError` and Gmail API errors. |
| Meta account or Page unavailable | Owner lost Page role, Page is restricted, or app lacks Advanced Access. Reconnect after restoring access. |
| Instagram account not eligible | Must be an Instagram professional account linked to the Page; personal accounts cannot use the messaging API. |
| Connection shows disconnected | Credentials were cleared after an auth failure or disconnect. Reconnect; status `error` includes `lastError`. |
| AI agent failed to generate response | LLM key missing/failed: the existing R7 fail-safe escalates without sending. Check `OPENROUTER_API_KEY` and ticket timeline. |
| Reply loops / duplicate replies | Should not happen: echoes, self-mail, and duplicate `externalMessageId` events are ignored. If it does, check for two connected channel rows or a modified pipeline. |

### Known limitations

- Only Gmail is implemented for email; Microsoft Graph/Outlook, SendGrid, and generic API-key
  providers are not. The credentials route is a documented placeholder.
- Gmail delivery is polling-based; real push requires Google Cloud Pub/Sub and a watch renewal job.
  `vercel.json` is not committed because cron frequency and plan limits are deployment-specific.
- Gmail restricted-scope verification is required for public production use.
- Meta supports Page Messenger and Page-linked Instagram professional accounts only. One asset per
  OAuth round. Production use of messaging permissions requires App Review and usually Business
  Verification; development mode only works for app testers.
- The backend uses the app-level Instagram webhook subscription; the Meta dashboard step cannot be
  automated through `subscribed_fields`.
- Outbound Meta/IG messages are text-only (the agent produces text); inbound attachments/non-text
  events are acknowledged and ignored.
- Email and Meta calls are processed synchronously inside the webhook/poll request. Meta retries
  safely thanks to idempotency, but very slow LLM calls can approach Meta's webhook timeout.
- No onboarding UI lives in this repository; the status/assets/connect/disconnect API contract above
  is what the frontend track consumes.

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
- `src/lib/baileys.ts` — HTTP client for the local Baileys service (shared-secret header, timeout,
  service-error mapping, `503`/`502` translation) plus constant-time verification of incoming
  service webhooks.
- `src/lib/whatsapp.ts` — per-business connection ids (`wa_...`), `configJson` persistence and
  channel-status mapping, `connectionId → channel` tenant resolution, and the inbound handler that
  reuses `handleInboundWebhook` and sends the auto-reply only when routing allows it.
- `src/lib/whatsapp-access.ts` — session/ownership guard used by the connect, status, and disconnect
  routes.
- `src/lib/integration-crypto.ts` — AES-256-GCM vault for provider credentials and HMAC-signed,
  expiring OAuth state (provider + business + user + redirect URI).
- `src/lib/channels.ts` — adds `configJson` read/write helpers, `ensureChannelConnection` (creates
  channel rows that predate a new type without a migration), and `lastError` markers.
- `src/lib/email.ts` — Gmail OAuth + refresh, encrypted token storage, MIME in-thread replies,
  unread polling with self/echo/dedup guards, status, and disconnect/revoke.
- `src/lib/meta.ts` — Meta OAuth + long-lived token exchange, Page/IG asset discovery, encrypted
  20-minute pending selection, server-side asset validation, Page subscription, signed webhooks
  (Messenger + Instagram), Page-token sends, status, and disconnect.
- `src/lib/social-message.ts` — normalized message shape shared by the email and Meta adapters.
- `src/lib/integrations.ts`, `src/lib/oauth-redirect.ts`, `src/lib/cron.ts` — OAuth base URL and
  browser-redirect handling plus constant-time cron authentication.
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
- `tests/baileys.test.ts` — connection id validation, `connectionId → business` mapping, service
  secret checks, client payload/error mapping, inbound triage with auto-reply, duplicate
  suppression, cross-tenant isolation, and status persistence/mode restore.
- `tests/whatsapp-routes.test.ts` — route-level behaviour with a mocked session and service client:
  connect/reuse/ownership denial, QR/status polling, reconnect-required handling, disconnect modes,
  inbound secret + payload validation, and status webhook updates.
- `tests/integration-crypto.test.ts` — AES-GCM round-trip/tamper/missing-key handling and OAuth state
  signature, payload, expiry, and missing-secret rejection.
- `tests/email.test.ts` — Gmail OAuth URL/exchange, encrypted token persistence, refresh and
  `invalid_grant` handling, MIME header injection, in-thread sends, polling with self-mail skip,
  duplicate suppression, no-send routing, status, and disconnect/revoke.
- `tests/meta.test.ts` — Meta OAuth URL/exchange (long-lived required), Page + linked IG discovery,
  encrypted pending selection with expiry and user binding, Page/IG selection + subscription
  validation, webhook HMAC/challenge, Messenger/IG event routing, echo + duplicate suppression,
  Graph code 190 credential clearing, status, and disconnect.
- `tests/social-routes.test.ts` — session/ownership enforcement, provider-not-configured errors,
  status/error shapes without secrets, Gmail-webhook 501, cron-guarded polling, Meta redirect,
  pending-asset exposure, webhook verification/signature rejection, and invalid OAuth state.

The standalone service has its own 29-test suite (fake Baileys sockets, no real account):
`cd baileys-service && npm test`. See [`baileys-service/README.md`](baileys-service/README.md#tests).

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

WhatsApp: `BAILEYS_SERVICE_URL` (local `http://localhost:3001` or a tunnel URL), the shared
`BAILEYS_SERVICE_SECRET` (identical in `baileys-service/.env`), and optional `BAILEYS_TIMEOUT_MS`.
When these are unset the WhatsApp routes answer `503 BAILEYS_NOT_CONFIGURED`. `/api/health` reports
`checks.whatsappServiceConfigured` without revealing the URL or secret. The service's own env vars
are documented in [`baileys-service/.env.example`](baileys-service/.env.example).

Email and Meta: `INTEGRATION_ENCRYPTION_KEY` (required to store provider tokens; 32 bytes base64/hex)
and `INTEGRATION_STATE_SECRET` (falls back to `AUTH_SECRET`). `INTEGRATIONS_BASE_URL` is the public
backend URL used to build OAuth redirect URIs; `INTEGRATIONS_FRONTEND_REDIRECT_URL` optionally sends
the browser back to the frontend after a callback. Email uses `EMAIL_PROVIDER` (only `gmail`),
`EMAIL_GMAIL_CLIENT_ID`/`EMAIL_GMAIL_CLIENT_SECRET` (falling back to the Google OAuth client), and
`CRON_SECRET` for polling. Meta uses `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, and
`META_WEBHOOK_VERIFY_TOKEN`. `/api/health` reports `emailIntegrationConfigured`,
`metaIntegrationConfigured`, `integrationEncryptionConfigured`, `oauthStateConfigured`, and
`emailPollingScheduledJobConfigured` without exposing any values.

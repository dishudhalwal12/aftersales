# Running the WhatsApp bridge on a teammate's laptop

The WhatsApp integration cannot run on Vercel. Baileys holds a long-lived WhatsApp Web
socket per linked number, and a serverless function has no process to hold it. So the
bridge in `baileys-service/` runs on a machine that stays awake, and the deployed app
talks to it over a tunnel.

This page is the operator's checklist for that arrangement. For how the bridge works
internally — endpoints, payloads, security model, tests — read
[`baileys-service/README.md`](../baileys-service/README.md) instead. That document is the
reference; this one is the deployment.

```
teammate's laptop                          Vercel (production)
┌──────────────────────────┐               ┌──────────────────────────┐
│ baileys-service :3001    │               │ aftersales-ai            │
│  ├─ WhatsApp sockets     │◀── tunnel ────│  BAILEYS_SERVICE_URL     │
│  └─ sessions/ (creds)    │               │  BAILEYS_SERVICE_SECRET  │
└──────────┬───────────────┘               └──────────────────────────┘
           │                                            ▲
           └────── webhook: /api/channels/whatsapp/ ────┘
                    inbound + status (public HTTPS, no tunnel)
```

Only one direction needs the tunnel. The laptop reaching Vercel is ordinary outbound
HTTPS; Vercel reaching the laptop is not possible without one.

## Where this project stands today

Verified against the running system, not assumed:

| Piece | State |
| :--- | :--- |
| Bridge code | on `main` — `baileys-service/`, 6 `/api/channels/whatsapp/*` routes, `src/server/integrations/baileys.ts` |
| Bridge running locally | **yes** — `:3001`, `connections: { total: 1, connected: 1 }` |
| A WhatsApp number linked | **yes** — one device paired on the local bridge |
| Local app → bridge | **works** — `GET /api/health?deep=1` returns `reachable: true` |
| Tunnel to the laptop | **missing** |
| `BAILEYS_SERVICE_URL` / `BAILEYS_SERVICE_SECRET` on Vercel | **missing** — production reports `baileysConfigured: false` |

So the work is not "build the integration". It is "expose a working integration to
production": start a tunnel, set two variables, redeploy. Everything below is that.

## The environment contract

Both sides must agree on one secret. Nothing else is shared.

### On Vercel (Project → Settings → Environment Variables)

| Variable | Value | Notes |
| :--- | :--- | :--- |
| `BAILEYS_SERVICE_URL` | the tunnel origin, e.g. `https://wa.example.com` | No trailing slash. Must be `https`, or the browser and Vercel will refuse it. |
| `BAILEYS_SERVICE_SECRET` | 64 hex chars | Generate with the command below. Must be byte-for-byte identical to the laptop's value. |
| `BAILEYS_TIMEOUT_MS` | optional, `15000` | Default 15 s. Must stay **above** the laptop's `CONNECT_WAIT_MS` (10 s), because `/connect` blocks until the first QR appears. Capped at 60 s. |

`isBaileysConfigured()` only checks that `BAILEYS_SERVICE_URL` and
`BAILEYS_SERVICE_SECRET` are both non-empty. It does not prove the laptop is awake — see
[Checking that the bridge is actually up](#checking-that-the-bridge-is-actually-up).

### On the laptop (`baileys-service/.env`)

| Variable | Value for this project |
| :--- | :--- |
| `PORT` | `3001` |
| `BAILEYS_SERVICE_SECRET` | the same 64 hex chars as Vercel |
| `VERCEL_BACKEND_URL` | `https://aftersales-sphinx.vercel.app` |
| `SESSION_STORAGE_PATH` | `./sessions` |
| `LOG_LEVEL` | `info` |

`VERCEL_WEBHOOK_URL` and `VERCEL_STATUS_WEBHOOK_URL` are derived from
`VERCEL_BACKEND_URL`; set them explicitly only to point the webhooks somewhere else.

Generate the secret once, on the laptop:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the **same** string into both `.env` files. A trailing space or a stray quote on
either side produces `401 BAILEYS_AUTH_FAILED` on every call and looks exactly like a
wrong secret.

## Setting it up

Run these on the teammate's laptop, in the repository root.

```bash
# 1. Install the bridge's own dependencies.
cd baileys-service && npm install

# 2. Create its env file and fill in the four values above.
cp .env.example .env

# 3. Start it.
npm start
```

It prints `listening on http://localhost:3001` plus the webhook targets. Confirm it
locally before involving the tunnel:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"aftersales-baileys","uptimeSeconds":…,"connections":{…}}
```

### Exposing it

Use a **named** Cloudflare Tunnel rather than a free rotating URL. A rotating URL means
every restart silently breaks production until someone updates `BAILEYS_SERVICE_URL` and
redeploys — which is the single most common way this setup goes dark.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create aftersales-wa
cloudflared tunnel route dns aftersales-wa wa.example.com
cloudflared tunnel run --url http://localhost:3001 aftersales-wa
```

Verify from somewhere that is not the laptop:

```bash
curl https://wa.example.com/health
```

`/health` is deliberately public and unauthenticated — it is a liveness probe, not a data
endpoint. Everything else on the service requires `x-baileys-secret`.

### Wiring production

Set `BAILEYS_SERVICE_URL` and `BAILEYS_SERVICE_SECRET` in Vercel, then **redeploy**. The
deployment reads these at runtime, but an environment change does not apply to the
running deployment on its own.

Confirm the wiring landed:

```bash
curl -s https://aftersales-sphinx.vercel.app/api/health | grep -o '"baileysConfigured":[a-z]*'
# "baileysConfigured":true
```

Then sign in, open a business's **Channels** panel, and click **Connect WhatsApp**. Scan
the QR from **WhatsApp → Linked Devices → Link a device**.

## Keeping the laptop actually awake

This is the part that decides whether the setup survives a week.

**Stop it sleeping.** On macOS:

```bash
caffeinate -dimsu npm start
```

`-d` keeps the display from sleeping, `-i` prevents idle sleep, `-m` prevents disk sleep,
`-s` prevents system sleep on AC power, `-u` asserts user activity. On a closed lid, no
`caffeinate` flag helps — the machine suspends. Keep the lid open, or disable lid sleep:

```bash
sudo pmset -c disablesleep 1   # revert with 0
```

**Survive a crash or a reboot.** `cloudflared` and the bridge are two processes; if either
dies the integration is down. A `launchd` job with `KeepAlive` restarts both, and
`RunAtLoad` brings them back after a power cut. Do not rely on remembering to start them.

**Turn off battery-saving sleep on the network interface.** "Wake for network access" must
stay on, or the tunnel's keepalive drops while the machine is idle.

**Treat `sessions/` as a password.** Each sub-folder is a linked-device credential. Losing
it means re-scanning the QR; leaking it means someone can send as that number. Never commit
it, never copy it between machines in pieces, and back it up only encrypted — the service
`.gitignore` already excludes it.

## Checking that the bridge is actually up

`GET /api/health?deep=1` answers the reachability question directly:

```bash
curl -s https://aftersales-sphinx.vercel.app/api/health?deep=1
```

```json
"baileys": { "configured": true, "reachable": true,
             "uptimeSeconds": 5176, "connections": { "total": 1, "connected": 1 } }
```

Or, when the laptop is asleep:

```json
"baileys": { "configured": true, "reachable": false, "error": "The bridge is unreachable." }
```

The probe is opt-in (`?deep=1`) on purpose. The bare `/api/health` stays network-free so
it can serve as a readiness probe; it must not start failing because a laptop is asleep.
The probe also gives up after 2.5 s rather than the 15 s connect budget, so a status page
never appears hung.

Three different questions, three different answers:

| Question | How to ask |
| :--- | :--- |
| Is the *code* wired? | `curl -s …/api/health \| grep baileysConfigured` → `true` |
| Is the *laptop* reachable? | `curl -s '…/api/health?deep=1'` → `"reachable": true` |
| Is *WhatsApp* linked? | same response → `"connections": { "connected": 1 }` |

`baileysConfigured: true` is the weakest of the three: it only means both variables are
set. A sleeping laptop, a rotated tunnel URL, or a logged-out device all keep it `true`
while messages stop flowing. That gap is exactly why the deep probe exists.

## When it breaks

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `503 BAILEYS_NOT_CONFIGURED` | a variable is unset on Vercel | set both, redeploy |
| `401 BAILEYS_AUTH_FAILED` | secrets differ | re-paste the same string on both sides, restart the bridge, redeploy Vercel |
| `502 BAILEYS_UNAVAILABLE` | laptop asleep, bridge stopped, or tunnel down | wake it, restart, `curl` the tunnel `/health` |
| QR never appears | `/connect` timed out | check `CONNECT_WAIT_MS` (10 s) is below `BAILEYS_TIMEOUT_MS` (15 s) |
| Connected, but no tickets | webhook cannot reach Vercel | check `VERCEL_BACKEND_URL`; the bridge logs `inbound forwarding failed` |
| Session gone after restart | `sessions/` deleted or moved | re-scan the QR; restore the folder from backup |
| Everything worked yesterday | tunnel URL rotated | use a named tunnel so it cannot rotate |

## Handover

Whoever runs the laptop owns the number, the credentials, and the uptime. Record here:

- **Owner:** _(name, contact)_
- **Tunnel hostname:** _(e.g. `wa.example.com`)_
- **Secret location:** _(password manager entry, not in the repo)_
- **WhatsApp number linked:** _(E.164)_
- **Restart procedure:** _(launchd label, or the two commands)_

If the owner leaves the project, rotate `BAILEYS_SERVICE_SECRET` on both sides and
disconnect the device from WhatsApp → Linked Devices before moving the tunnel.

## Why not Vercel

Vercel's functions are request-scoped: they start on a request and stop shortly after. A
WhatsApp Web session is the opposite — a socket that must stay open, with credentials
written to disk and reconnect logic across hours. There is no place in that model for a
long-lived socket or a filesystem that persists. The bridge is not a missing Vercel
feature; it is a different kind of process.

The alternative is Meta's WhatsApp Cloud API, which *is* webhook-shaped and would run on
Vercel without a laptop. It requires a Meta app, a verified business, and a number that is
not already on the WhatsApp Business app. That trade — a laptop you maintain versus a Meta
verification you wait for — is why this path exists.

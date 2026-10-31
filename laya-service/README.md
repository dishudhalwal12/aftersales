# AfterSales AI — Local Laya Decision Service

A small Python service that runs **Laya** (`aac6fef/laya-typed-decisions-mlx`) natively on Apple
silicon and answers the fixed set of typed questions this product asks about one customer message:
is it urgent, what does the customer want, how frustrated are they, is a human being asked for, is
this a sensitive case, is money being asked back, is the customer about to leave.

It is a sibling of `baileys-service`: a separate process with its own README, its own environment,
and one shared secret between it and the Next.js backend. Nothing the browser sends ever reaches it
directly.

**Advisory, by design.** The decision sheet is stored on the ticket and shown in the dashboard next
to the classifier's numbers. It never changes anything: R1–R7 routing keeps reading the classifier
output alone, so a second model can add a second opinion without being able to change what happens
to a customer.

---

## Why a separate process

| | |
|---|---|
| **Platform** | MLX needs Apple silicon and macOS 14+. Vercel cannot run it, and the Next.js app must deploy to Linux. |
| **Memory** | One resident 421M-parameter checkpoint. Loading it per request would cost a download plus ~1.3 s of build time each time. |
| **Isolation** | A model that fails to load must not take triage down with it. Here it degrades to "no decision sheet" and every ticket still routes. |

```
owner dashboard (Vercel)
        │  session cookie
        ▼
Next.js API routes ──x-laya-secret──▶ this service (:8100) ──▶ MLX ──▶ ModernBERT-large + heads
        │                                    ▲
        │  typed decisions, stored on the    │
        │  ticket next to the classifier's   │
        └────────────────────────────────────┘
```

---

## Requirements

- Apple silicon Mac (M1 or later), macOS 14+
- Python 3.11+ (the repo also ships `.python-version` = 3.12 for `uv`)
- ~2 GB of disk for the virtualenv and the FP16 checkpoint

## Install

From the repository root, `npm run setup` already does this (it prefers `uv`, falls back to
`python3 -m venv`, and writes `.env` with a generated secret). The manual route below is for running
this service on its own:

With [uv](https://docs.astral.sh/uv/) (what this repo uses):

```bash
cd laya-service
uv sync --extra dev          # creates .venv with laya-mlx[serve], fastapi, uvicorn
```

With plain Python:

```bash
cd laya-service
python3.12 -m venv .venv
.venv/bin/pip install -e '.[dev]'
```

The first prediction downloads the checkpoint (~900 MB) into the Hugging Face cache. Later runs are
fully local; point `LAYA_MODEL` at a local directory to run offline after that.

## Run

From the repository root, `npm run dev` starts this service next to the app and the WhatsApp bridge,
handing it the shared secret and port — that is the intended path once the repo is cloned. Standalone:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # put this in LAYA_SERVICE_SECRET
uv run python -m laya_service
```

```
laya-service: model=aac6fef/laya-typed-decisions-mlx
laya-service: secret configured
laya-service: listening on http://127.0.0.1:8100
```

Check it is alive and warm:

```bash
curl -s localhost:8100/health | python3 -m json.tool
```

## Connect the app

In the Next.js `.env`:

```dotenv
LAYA_SERVICE_URL="http://127.0.0.1:8100"
LAYA_SERVICE_SECRET="<the same value as LAYA_SERVICE_SECRET above>"
LAYA_TIMEOUT_MS="4000"          # optional; default 4000, capped at 30000
```

Both variables are needed: half-configured counts as off, never as half-working. With them set,
every new ticket gets a decision sheet; with them empty, tickets say so instead of showing a blank
panel. `GET /api/health` reports `integrations.layaConfigured`.

If the app is deployed (Vercel), the service needs a tunnel — Vercel cannot reach your `localhost`.
Expose `:8100` the same way the Baileys bridge is exposed and put the tunnel origin in
`LAYA_SERVICE_URL`. This service never calls back into the app, so only that one direction needs a
public address.

---

## HTTP contract

### `GET /health` — open, no credential

```json
{
  "status": "ok",
  "service": "laya-decision-service",
  "model": "aac6fef/laya-typed-decisions-mlx",
  "modelReady": true,
  "loadError": null,
  "sheetVersion": 1,
  "decisions": 8,
  "secretConfigured": true
}
```

`modelReady: false` during the first download is a normal state; `loadError` says why if it will
never be ready.

### `POST /decision-sheet` — needs `x-laya-secret`

```bash
curl -s localhost:8100/decision-sheet \
  -H "x-laya-secret: $LAYA_SERVICE_SECRET" \
  -H 'content-type: application/json' \
  -d '{"message":"I was billed twice. Please refund the duplicate today or I am cancelling."}'
```

```json
{
  "provider": "laya-mlx",
  "model": "aac6fef/laya-typed-decisions-mlx",
  "sheetVersion": 1,
  "latencyMs": 383.1,
  "decisions": [
    {
      "id": "urgent_now",
      "kind": "noul",
      "title": "Needs attention now",
      "verdict": "urgent",
      "probability": 0.6696,
      "confidence": 0.6696,
      "options": []
    },
    {
      "id": "urgency",
      "kind": "score",
      "title": "Urgency",
      "verdict": "blocking issue or hard deadline",
      "probability": 0.529,
      "confidence": 0.529,
      "value": 0.7645,
      "options": [
        { "label": "no time pressure", "probability": 0.05 },
        { "label": "needs attention soon", "probability": 0.42 },
        { "label": "blocking issue or hard deadline", "probability": 0.529 }
      ]
    }
  ]
}
```

One record shape for all three question types:

| Field | Meaning |
|---|---|
| `id` | catalog id — `urgent_now`, `urgency`, `intent`, `frustration`, `human_requested`, `sensitive_case`, `refund_requested`, `churn_risk` |
| `kind` | `noul` (yes/no) · `score` (ordered rubric) · `choice` (one of N) |
| `verdict` | the answer in words, ready to display |
| `probability` | `noul`: P(true) · `choice`: probability of the verdict · `score`: probability of the top band |
| `confidence` | the model's own confidence for that question (0–1) |
| `value` | `score` only: expected rubric level as 0–1 |
| `options` | `choice`/`score`: every option with its probability |

Errors use the same envelope as the rest of this codebase:

```json
{ "error": { "code": "LAYA_MODEL_NOT_READY", "message": "The checkpoint is still loading; retry shortly." } }
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | body is not JSON, `message` is missing/empty/too long, or the body exceeds 256 KiB |
| 401 | `UNAUTHORIZED` | missing or wrong `x-laya-secret` |
| 503 | `LAYA_NOT_CONFIGURED` | `LAYA_SERVICE_SECRET` is unset — the service will not score messages for whoever can reach the port |
| 503 | `LAYA_MODEL_NOT_READY` | no resident checkpoint yet, and it did not arrive within `LAYA_READY_TIMEOUT_SECONDS` |
| 500 | `LAYA_BAD_ANSWER` | the checkpoint returned something the question types do not describe |
| 500 | `LAYA_INFERENCE_FAILED` | anything else; the body carries no paths, weights or memory text |

---

## The question catalog

`laya_service/questions.py` is the model's real interface — the wording lives next to the checkpoint,
not in TypeScript. Every instruction names `` `message` `` in backticks and the state is
`{"message": …}`, so the question and the state agree.

| id | kind | why it is asked |
|---|---|---|
| `urgent_now` | yes/no | the headline: does this need a human within the hour |
| `urgency` | 3-level rubric | graded urgency, so "soon" is distinguishable from "now" |
| `intent` | 6 options | refund · technical · billing · information · cancellation · other |
| `frustration` | 4-level rubric | tone, independent of the classifier's sentiment label |
| `human_requested` | yes/no | the customer asked for a person |
| `sensitive_case` | yes/no | money dispute, legal threat, safety or medical issue |
| `refund_requested` | yes/no | money back, explicitly |
| `churn_risk` | yes/no | about to leave or cancel |

Option descriptions come from the upstream `triage_questions` preset: the model card says describing
each option works much better than bare labels. Eight questions cost ~546 input tokens, well inside
the 1024-token context and the package's 64-question / 512-option ceilings.

---

## Measured here

MacBook, Apple silicon, FP16, 8 questions per message (not the model card's single-question figure):

| | |
|---|---|
| Checkpoint load, warm cache | 1.3 s |
| One decision sheet, 546 input tokens, in-process and otherwise idle | 383–475 ms |
| The same sheet over HTTP while two Next.js dev servers were also running | 0.77–0.96 s end to end |
| Peak MLX memory | ~950 MiB |

The eight questions are evaluated as eight rows in one forward pass, so the cost is dominated by
prompt length, not by the number of questions. The app calls this in parallel with the classifier:
against a real model call (1–3 s) the sheet is hidden, while against the labelled offline classifier
it becomes the slowest step of triage. That is the honest trade for an advisory second opinion.

On `"I was billed twice. Please refund the duplicate today or I am cancelling."` it answered
`urgent`, `blocking issue or hard deadline`, `refund`, `clearly annoyed`, `sensitive case: yes`,
`churn risk: yes` — and `human_requested: yes` at 0.525, which is a coin flip rather than a
confident miss. That is the model card's own caveat: **its confidence is uncalibrated**, so the panel
shows the number instead of hiding it.

## Limits worth knowing

- **English only.** Use `convaiinnovations/laya-multilingual` (and `aac6fef/laya-multilingual-mlx`) if
  the corpus is not English; the catalog and the service do not need to change.
- **Advisory only.** No value from this service reaches a routing rule.
- **Not a generator.** It scores constrained questions; the reply text still comes from the classifier.
- **Specialist.** The checkpoint is fine-tuned on four upstream workflows; expect base-model behaviour
  on anything outside customer service, invoices, security incidents and agent traces.
- **No fallback path to another host.** MLX is Apple-only. Running this on Linux/GPU means the
  upstream PyTorch `laya` package behind the same HTTP contract; the app would not change.

## Tests

```bash
cd laya-service
uv run pytest              # 52 tests: catalog, answer shaping, config, HTTP contract
uv run pytest -q tests/test_app.py
```

The suite needs no checkpoint: `tests/fakes.py` supplies the exact answer shapes `laya_mlx` 0.6.0
emits, so a runtime upgrade that changes the shape fails the suite instead of the dashboard.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `modelReady: false`, `loadError` mentions a download or HTTP error | the first pull failed — check network access to `huggingface.co`, then restart |
| `503 LAYA_NOT_CONFIGURED` with a secret in `.env` | the service was started from another directory; `.env` is read relative to the working directory |
| `401 UNAUTHORIZED` from the app side | `LAYA_SERVICE_SECRET` differs between the two `.env` files (a trailing newline is enough) |
| Every ticket shows "service was unreachable" | the service is not running, or the deployed app cannot reach `127.0.0.1` — set the tunnel origin |
| `rejected` on one long message | the message exceeds `LAYA_MAX_MESSAGE_CHARS`; it is refused rather than truncated, so the sheet is never about a different message |
| Load hangs | `USE_TF=0` in the environment (the package sets it, but a shell profile can override it) |

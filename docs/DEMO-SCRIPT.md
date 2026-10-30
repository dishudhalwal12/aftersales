# Demo script — 2 minutes, six beats

> Must work **muted**. Every beat carries a burn-in caption, because Round 1 is scored off the
> artifact with no narrator present. If a beat needs a voice to make sense, the beat is wrong.

**Format:** 1440×900, screen recording, cursor visible, no music.
**Pre-flight:** `npm run db:reset` the morning of the demo. Log in with **1-Click Judge Demo Login**
(owned by `judge@demo.aftersales.ai`, which owns both seeded businesses).

## Shot list

| t | Beat | Screen | Action | Visible proof | Burn-in caption |
|---|---|---|---|---|---|
| `0:00–0:10` | Cold open | Landing `/` | none | Hero conversation: a grounded R6 reply, then an R2 escalation with "no grounded chunk" | `Support that stops guessing` |
| `0:10–0:22` | One-click in | `/auth` | Click **1-Click Judge Demo Login** | Lands on `/dashboard` with CloudPulse CRM already selected | `Owner is the only login. Customers never authenticate` |
| `0:22–0:38` | The queue | Panel 1 | Point at the channel badges and the rule badges | WhatsApp / Instagram / Gmail / voice tickets in one list, each carrying a rule and a confidence | `4 channels · 1 queue · 7 ordered rules` |
| `0:38–1:05` | **The product** | **Test my AI agent** | Click **distressed customer**, then **wants a human** | Confidence 87 but badge **R3** (distress beats confidence); then **R1**; both `escalated`, no send | `Confidence is not the only trigger. Distress outranks it` |
| `1:05–1:18` | Same question, other tenant | Modal → business switcher → Jaipur Smile Studio → ask the Pro Plan question | Read the result | Confidence drops to **20**, badge **R2**, "no chunk was cited" | `Same question, different business → it refuses to guess` |
| `1:18–1:34` | Show the work | Panel 1 → open an escalated ticket | Scroll the event trail | `INBOUND_RECEIVED → RAG_RETRIEVED → ROUTING_DECIDED (R2) → ESCALATED`, with cited chunk ids | `Every decision, with the rule that made it` |
| `1:34–1:50` | Idempotency | Panel 4 — Channels | Select Instagram → **Deliver twice** | "Two deliveries, one ticket — the unique externalMessageId absorbed the replay" | `A replayed webhook cannot answer twice` |
| `1:50–2:10` | Voice, honestly | Panel 2 — Voice test | **Call me now** → **Run tool search** → **Record completed call** | Session + 4-digit PIN, dry-run banner, grounded fact with `chk_cp_04`, then a VOICE ticket in the queue | `Same number, per-call business context — the call leg needs Sarvam keys` |
| `2:10–2:20` | Bonus twist | Panel 3 — Brain & insights | none | Sentiment mix, escalation rate, recurring complaints grouped by intent | `Weekly recurring complaints, computed from the same tickets` |

## Fallbacks

| Beat | If it fails | Then |
|---|---|---|
| 4 | OpenRouter key is set and the model returns something odd | Switch `LLM_PROVIDER=heuristic` and restart: the offline classifier is deterministic and labelled |
| 6 | Another tenant's ticket id returns 200 | Stop. That is a security bug — check `loadOwnedBusiness()` before recording anything else |
| 8 | The voice panel has real Sarvam keys | The call will actually ring. Say so; do not claim a dry run when a phone is ringing |
| Any | Database was reset mid-session | `npm run db:setup` and restart — the seed is idempotent |

## Honesty notes — say these, do not hide them

1. **The offline classifier is not a model.** With no key it extracts the cited chunk's sentences and
   scores coverage. The dashboard says so in a banner; say it too.
2. **No telephone leg on this deployment.** Session, PIN, retrieval and write-back are real; the dial
   needs Sarvam credentials.
3. **Channel transports are simulated.** The webhook contract, idempotency and routing are real; no
   live WhatsApp/Meta/Google session is running.
4. **The knowledge base is sample content we authored.** Retrieval is real; the corpus is not a
   customer's.
5. **The checkout link is not built.** There is no payment integration and no order mutation.

## Timing discipline

Total `2:20`. Beats 4 and 5 carry the product (27 seconds) — they get the most care in the edit. If the
cut runs long, drop beat 9 (voice) first: it is the only beat whose core claim needs credentials we may
not have on the demo machine.

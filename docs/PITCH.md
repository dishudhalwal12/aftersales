# Pitch — 5 minutes, 10 slides

> **Readable with no narrator.** Round 1 is a 30-minute screen of the artifact, so every slide carries
> its own claim, its own proof and its own PS sentence.

Judging pillars (PS PDF prints "To be announced"; strongest available reading):
**P1 Originality · P2 Understanding of the PS · P3 Viability.**

| # | Slide | Sec | Pillar | The one claim | Proof on the slide |
|---|---|---|---|---|---|
| 1 | **Team 41** | 15 | gate | — | Team ID **41**, track *AI & Data Science*, PS 2.5 title, live URL, QR to the 2-minute video |
| 2 | **The drowning** | 30 | P2 | Repetitive volume and missed urgency are one failure: nothing sorts by **certainty** | The PS sentence, verbatim. One number with a unit — and if it is not validated, it says `TBD` |
| 3 | **Why today's tools miss it** | 30 | P1 | Every helpdesk sorts by channel or tag. None refuses to answer because it is unsure | Two columns: *routing by topic* vs *routing by confidence* |
| 4 | **The thesis** | 30 | **P1** | `confidence < 50` may not answer. Distress and urgency outrank confidence. A broken classifier is never a silent reply | The rule table R1–R7, with R2 highlighted: `confidence 49 → escalate` |
| 5 | **What it does** | 40 | P2 | 4 channels · 7 rules · 4 panels · 4-step wizard · 1 retriever — frozen, because two people | The counts, plus one line: *what we refused to add* |
| 6 | **Demo — 2 min** | 120 | P2 | Same question, two businesses: one grounded answer, one refusal | The recording, muted, captioned. Beats as in `DEMO-SCRIPT.md` |
| 7 | **The box you haven't seen** | 30 | **P1** | The model never decides whether to send. Seven rules in TypeScript do, and a cited chunk is verified against the tenant before it counts | The decision path from `ARCHITECTURE.md`, cropped to `classifier → R1–R7 → send/draft/escalate` |
| 8 | **Proof it holds** | 30 | P3 | The decision layer is tested, not demoed | `107 tests` · the 49/50 boundary · a live `403` for a foreign tenant · a replayed webhook producing one ticket |
| 9 | **Viability, honestly** | 35 | **P3** | A per-seat replacement for the first support hire, sold to the shop that already pays for WhatsApp | Who pays · price anchor · margin. **Limits strip:** offline classifier · no telephony · simulated transports · sample KB |
| 10 | **Next** | 10 | gate | One line of ask | The ask, the live URL, Team 41 |

**Total: 5:10.** Slide 6 is 40% of the budget. Cut slide 3 first, never 6 or 7.

## Claims ledger — nothing on a slide that is not traceable

| Judge-visible claim | Source | Status |
|---|---|---|
| 4 channels, 1 queue | `src/lib/business-service.ts`, seed | **Built** |
| `confidence < 50` never sends | `src/lib/routing-engine.ts`, `tests/lib/routing-engine.test.ts` | **Built + tested** |
| Distress / urgency / explicit request escalate | same | **Built + tested** |
| Every auto-send cites a real chunk from **that** tenant | `respondToContact()` + routing verification | **Built + tested** |
| Tenant isolation returns 403 | `tenant.ts`, live check | **Built + verified** |
| Replayed webhook = one ticket | unique `externalMessageId` + `P2002` handling | **Built + verified** |
| Weekly recurring complaints | `src/lib/insights.ts` | **Built + tested** |
| Voice: per-call business context | `start-session` → `sarvam-tool-search` | **Built + verified** |
| The outbound call itself | `src/lib/sarvam.ts` | **Conditional** — needs `SARVAM_API_KEY` + `SARVAM_CALL_ENDPOINT` |
| The classifier is a model | `llm-orchestrator.ts` | **Conditional** — offline retrieval classifier without a key, and labelled |
| Checkout link | — | **Not built.** Do not put it on a slide |

## Q&A — the six questions we will actually get

| Question | Honest answer |
|---|---|
| *"Isn't this ChatGPT over an inbox?"* | The classifier is not the product. The product is the rule that says below 50 confidence it **may not answer**, and that a citation is checked against the tenant before it counts. Show R2 and the 403. |
| *"Is the call real?"* | Say which it is. With Sarvam keys the panel places a real outbound call; without them it is a labelled dry run and the telephone leg is not claimed. |
| *"Is WhatsApp actually connected?"* | No. The inbound webhook contract, the idempotency and the routing are real; the transport is simulated and the card says so. |
| *"Does it take payments?"* | No. No payment integration, no order mutation. |
| *"What's mocked?"* | Point at the README's real-vs-mocked table: sample KB, seeded customers and tickets, simulated transports, offline classifier when no key is set. Retrieval, routing, isolation and idempotency are not mocked. |
| *"Two people?"* | Yes — which is why the counts are frozen at 4 channels / 7 rules / 4 panels and one vertical slice ships instead of eleven half-features. |

## Design rules for the deck

- Stark off-white + jet black + one accent per status (emerald / amber / crimson). No gradients as decoration.
- One claim per slide title. If the title needs a subtitle to be understood, rewrite the title.
- Every diagram legible at 50% zoom; every number carries a unit; every `TBD` is visibly a `TBD`.
- Truthful labels everywhere: `connected` vs `test mode` vs `draft only` vs `simulated`.

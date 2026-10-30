# Pitch — 5 minutes, 10 slides

> **Readable with no narrator.** Round 1 is a 30-minute screen of the artifact, so every slide must
> carry its own claim, its own proof and its own PS sentence. If a slide needs a voice to make sense,
> the slide is wrong. Talk track is a bonus, not a dependency.

Three pillars (from `hackathon-context/03-judging-and-strategy.md`; the PS PDF prints "To be
announced", so these are the strongest available reading): **P1 Originality · P2 Understanding of the
PS · P3 Viability & Business Feasibility.**

| # | Slide | Sec | Pillar | The one claim | PS 2.5 sentence behind it | Proof on the slide |
|---|---|---|---|---|---|---|
| 1 | **Team 41** | 15 | gate | — | — | Team ID **41** at display size, track *AI & Data Science*, PS title 2.5, live URL, QR to the 90 s video |
| 2 | **The drowning** | 30 | P2 | Repetitive volume and missed urgency are the same failure: nobody is sorting by certainty | *"Small businesses drown in repetitive support queries and miss urgent ones, while hiring support staff is expensive."* | One number: `1 support seat ≈ ₹3.6 L/yr` — `TBD — needs validation via a published Indian SMB support-salary band before 09:00`. Second number: minutes-to-first-human on the seeded 50-contact run |
| 3 | **Why today's tools fail** | 30 | P1 | Every helpdesk sorts by **channel**. None sorts by **how sure the machine is** | *"…drafts replies from a company knowledge base, and escalates sensitive cases to a human."* | 2-column table: *existing = routing by topic/tag* vs *ours = routing by confidence* |
| 4 | **The thesis** | 30 | **P1** | `confidence < 50` → don't answer, beep — and beep **on the same call**, because a callback is a lost customer | *"…escalates sensitive cases to a human."* | The one sentence, large. Beneath it: `92 → 38 → beep` |
| 5 | **What it does** | 40 | P2 | 4 channels, 7 ordered rules, 6 tools, 4 panels, 2 jobs — no more, because 2 people | *"Agent that reads incoming emails or chats, classifies intent and urgency…"* | The counts, and the cut they cost us (one line: *what we refuse to add*) |
| 6 | **Demo — 90 s** | 90 | P2 | The whole product in one call | *"…and escalates sensitive cases to a human."* | The video, muted, captioned. Beats 1→6 as in `DEMO-SCRIPT.md` |
| 7 | **The one box you haven't seen** | 30 | **P1** | Beep → mute AI → bridge the **existing** audio leg. A transfer is not merely avoided; it is unrepresentable in the state machine | *"…escalates sensitive cases to a human."* | `docs/ARCHITECTURE.md` diagram, cropped to the escalation box + the CALL machine. Call it: *the leg id is immutable* |
| 8 | **Proof it holds** | 30 | P3 | The decision layer is tested, not demoed | *"…classifies intent and urgency."* | `68 tests · 100% branch · R2 boundary mutation-caught`. Routing table R1–R7 rendered as a table, with R2 and R7 highlighted |
| 9 | **Viability, honestly** | 35 | **P3** | A per-seat replacement, sold to the shop that already pays for WhatsApp | *"…while hiring support staff is expensive."* | Who pays · price anchor · margin. **Plus a limits strip:** Baileys is unofficial · KB is sample data · checkout link is a link, not a transaction |
| 10 | **Next** | 10 | gate | One line of ask | — | The ask, the live URL, Team 41. Nothing else |

**Total: 5:05.** Slide 6 is 30% of the budget and carries the argument; cut slide 3 first if time is
short, never slide 6 or 7.

## Claims ledger — nothing on a slide that is not traceable

| Judge-visible claim | Source | Status |
|---|---|---|
| 4 channels, one queue | `CAPABILITY.md` F1/F6 | Contract |
| `confidence < 50` → beep | `CAPABILITY.md` R2, `src/domain/routing.ts` | **Built + tested** |
| Beep → mute → bridge, never transfer | `CAPABILITY.md` F2/F8, `src/domain/machines.ts` | Contract + state machine built; audio not yet |
| Hinglish voice, English text | `CAPABILITY.md` F4 | Contract |
| 6 MCP tools, typed envelope | `CAPABILITY.md` §MCP tool signatures rev 1, `src/domain/envelope.ts` | **Envelope built + tested**; tools not yet |
| Weekly insights report | PS 2.5 bonus twist | Contract (Inngest job 1) |
| Rule id + reason code on every decision | `CAPABILITY.md` A5 | **Built** (routing returns the rule) |
| **Checkout link** | ⚠ **No PS sentence. No contract entry.** | **NEW CLAIM — needs sign-off** before it appears on a slide. It is a URL in message text, not commerce |
| `1 support seat ≈ ₹3.6 L/yr` | — | `TBD — needs validation via a cited salary band` |

## Q&A — the six questions we will actually get

| Question | Honest answer |
|---|---|
| *"Isn't this ChatGPT over an inbox?"* | The classifier is not the product. The product is the rule that says **below 50 confidence it may not answer**, and the bridge that puts a human on the line without a transfer. Show R2 and the state machine. |
| *"Is the call real?"* | Depends on the PSTN test — say which it is. If the beat is recorded, the caption says recorded. Never claim live when it is a clip. |
| *"Isn't Baileys against WhatsApp's terms?"* | Yes. It is an unofficial client, it can be banned, it is isolated behind an adapter, and it is written in the README. A production build moves to the Business API; we chose not to spend the window on Meta verification. |
| *"Does it take payments?"* | No. The link is real text; the transaction is not ours. |
| *"What's mocked?"* | Point at the README table. Sample KB, seeded customers, checkout link. The retrieval, the routing and the escalation are not mocked. |
| *"Two people?"* | Yes — and that is why the counts are frozen at 4/6/4/2. Eleven half-features lose to one feature that survives a bad network. |

## Design rules for the deck itself

- Stark black + one accent (per `hackathon-context/03`): no purple gradients, no emoji as icons, 1px
  hairlines, real numbers.
- One claim per slide, in the slide title. If the title needs a subtitle to be understood, rewrite the
  title.
- Every diagram legible at 50% zoom; every number has a unit; every "TBD" is visibly a TBD rather than
  a rounded guess.
- Nothing above 2 screens per section, in the deck and in the docs it cites.

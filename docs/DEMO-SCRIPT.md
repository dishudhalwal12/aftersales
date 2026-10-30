# Demo script — 90 seconds, 6 beats

> Must work **muted**. Every beat carries a burned-in caption, because Round 1 is scored off the
> artifact with no narrator present. If a beat needs a voice to make sense, the beat is wrong.

**Format:** 1280×720, screen recording + cursor visible, no face, no music under the audio beats
(the beep must be audible and unmistakable).

## Pre-flight (5 minutes before recording)

- [ ] Logged in as the owner; dashboard already open on **Panel 1**
- [ ] Second phone on the desk, WhatsApp linked, screen mirroring on — it appears in shot at 0:30
- [ ] `business_brain.md` seeded from the 12-question wizard; `search_markdown_rag` returns chunks
- [ ] Demo customer seeded: `plan_tier: Pro`, two recent orders, one open ticket
- [ ] The **off-KB question** pre-written: *"can I pay in installments?"* — Beat 5 depends on the KB
      genuinely not covering it, so the confidence drop is measured, not acted
- [ ] Audio routed to the laptop speaker; `beep.wav` tested at recording volume
- [ ] Clock visible in frame (bottom-right). It is the proof the call never dropped

## Shot list

| t | Beat | Screen / window | Action | Visible proof (what the judge sees) | Burn-in caption |
|---|---|---|---|---|---|
| `0:00–0:06` | Cold open | Panel 1 — Live Queue | none | Four channel badges lit, empty queue, live clock ticking | `4 channels · 1 queue · 6 tools` |
| `0:06–0:20` | **1. Call in Hindi** | Panel 3 — Escalation Bay | Dial the Airtel number from the second phone; speak Hindi | Call card appears `ringing → laya_route`; waveform moves; **call timer starts and never stops again** | `Customer calls in Hindi — one number, no IVR` |
| `0:20–0:30` | **2. Laya confidence meter** | Call card expanded | none — the router already returned | Four fields visible: `confidence 92 · intent technical · urgency 40 · sentiment neutral`, rule badge **R6** | `Laya: 4 fields, nothing else` |
| `0:30–0:44` | **3. Technical agent fires WhatsApp mid-call** | Split: dashboard + second phone | Customer says "the export is failing"; agent calls `send_whatsapp_media(image)` | The screenshot **lands on the customer's phone while the call timer is still running** — the timer is the proof it was mid-call | `Cross-channel, mid-call — the call never dropped` |
| `0:44–0:56` | **4. Sales agent sends checkout link** | Same split | Customer asks about pricing; intent flips to `sales` | New message bubble on the phone with the seeded URL; intent badge changes `technical → sales`; rule **R6** | `Same agent, different specialist — intent routed in one call` |
| `0:56–1:10` | **5. Confidence drops** | Call card | Customer asks the pre-written off-KB question | Meter falls **92 → 38**; rule badge flips **R6 → R2**; decision card reads `escalate · low_confidence`; a draft appears but is **not sent** — no outgoing bubble on the phone | `Confidence < 50 → it stops answering` |
| `1:10–1:26` | **6. Beep + human takeover** | Panel 3 | Nothing — just let it fire | `beep.wav` audible; banner `AI muted`; owner clicks **Take Over**; owner speaks aloud and the customer answers; `line_state: held → bridged`; **call timer still the same clock** | `Beep. Mute. Bridge. Same call. No transfer.` |
| `1:26–1:30` | Close | Panel 2 — Ticket Detail | scroll the event trail | Ordered trail: `classified R6 → sent → classified R6 → sent → classified R2 → escalated → takeover` with timestamps | `Every decision, with the rule that made it` |

## Fallbacks

| Beat | If it fails on the recording pass | Then |
|---|---|---|
| 1 | PSTN never reaches Pipecat (unknown Q1) | Use the loopback clip, and the caption changes to `recorded` — do not fake a live call |
| 3 | WhatsApp session dropped / banned (Baileys risk) | Cut to the message already delivered on the phone, caption unchanged, and say so in Q&A |
| 5 | Laya returns a high confidence on the off-KB question | Swap to a question the KB provably lacks — the drop must be real, never scripted |
| 6 | Audio bridge device missing | Clip recorded at Phase 4 is the fallback; the 11:15 window is for re-recording, not first attempts |

## Honesty notes — state these, do not hide them

1. **The checkout link is a link, not a transaction.** The agent sends a real URL from the seeded KB.
   No payment integration, no order mutation. If asked, the answer is: *"the link is real, the
   transaction is not ours."* — `docs/product/CAPABILITY.md` non-goal: no money movement.
2. **The knowledge base is sample content we authored.** The retrieval is real; the corpus is not a
   customer's.
3. **Customers and orders are seeded demo data**, by design.
4. **WhatsApp rides Baileys**, an unofficial client — it can be rate-limited or banned. Declared in
   the README, said out loud in the pitch.

## Timing discipline

Total `1:30`. Beats 5 and 6 carry the product, so they get 30 of the 90 seconds. If the cut runs long,
remove Beat 4 (the checkout link) first — it is the weakest claim in the script and the only one
without a PS sentence behind it.

# CAPABILITY — superseded

> **Status: superseded, 30 Oct 2026.** This document described the first design: Pipecat + Laya +
> Kokoro voice, a 6-tool MCP server, 2 Inngest jobs and a beep→mute→bridge escalation. Revision 4.0 of
> the master PRD (`docs/prd/ps_2_5_master_executable_prd_team_41.md`) replaced it with a Next.js app,
> Prisma, Sarvam voice and channel webhooks. **The PRD won.** The current architecture is
> `docs/ARCHITECTURE.md`; the current status table is `README.md`.

## Why it changed

The two designs disagreed on the single most important number in the product:

| | This document (old) | PRD rev 4 (shipped) |
|---|---|---|
| `confidence` 50–69 | R5 — draft-only | **R6** — auto-send, if grounded |
| `confidence >= 70` | R6 — auto-reply | R6 — auto-reply |
| Draft-only | a confidence band | a **channel** property (R5) |
| Grounding rule | implicit | **explicit**: zero verified chunks ⇒ R2, regardless of confidence |

Keeping both tables would have meant two contradictory answers to "may this message be sent without a
human?" — so the older one was retired rather than left in the tree as a trap.

## What survived from it, unchanged

These invariants were re-implemented under the PRD and are still true today:

- **The end customer never authenticates.** The business owner is the only principal. No customer
  credential exists anywhere in the system.
- **`escalated` is never left by an automatic send.** Only a human resolves it.
- **A sensitive or low-confidence case is never auto-sent.** Confidence below 50 escalates; the agent
  drafts and waits where it may not send.
- **Every decision is visible with its reason code.** The rule id (`R1`–`R7`) is stored on the ticket
  and rendered in the dashboard, not buried in a log line.
- **One classifier and one retriever behind every channel.** Four channels, one brain.
- **The knowledge base is a small fixed doc set seeded by hand.** No ingestion pipeline.
- **No money movement.** Links are text; the agent never mutates an order or a payment.
- **Unofficial-client risk is declared, never hidden.** This now applies to the simulated transports:
  the UI labels what is connected, what is test mode, and what is draft-only.

## What was dropped

Pipecat transport, the Laya router, Kokoro TTS, IBM Watson references, the 6-tool MCP surface, the
append-only `events` table's original shape, and the 2 Inngest jobs. The weekly insights report moved
into the dashboard's `GET /api/businesses/[id]/insights` instead of a background job.

History is intact in git (`feat(domain): routing table, call/ticket machines, typed tool envelope`).

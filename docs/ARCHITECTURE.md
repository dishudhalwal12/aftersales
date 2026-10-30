# Architecture — Team 41, PS 2.5

> Derived from `docs/product/CAPABILITY.md` (rev 1). **No implementation claims beyond the
> "Built today" section.** Where a box is not built yet, it says so.

## Shape in one paragraph

Four untrusted channel adapters feed one classifier (**Laya**), which returns exactly four fields.
One ordered rule table (R1–R7) turns those fields into exactly three outcomes: escalate, draft-only,
auto-reply. The agent's only action surface is a **6-tool MCP server**; it has no shell, no raw HTTP,
no database handle. Escalation never hands off — it **bridges the existing audio leg** to the owner's
laptop. One append-only `events` table makes every decision visible on the dashboard, because a
judge-visible reason code is worth more than a log line.

## System diagram

```mermaid
flowchart TD
  subgraph CH["4 channels — untrusted input"]
    WA["WhatsApp<br/>Baileys"]
    IG["Instagram DM"]
    GM["Gmail"]
    VC["Voice<br/>1 Airtel number"]
  end

  subgraph IN["Intake"]
    ADP["Channel adapters<br/>Baileys isolated"]
    PIPE["Pipecat transport<br/>Kokoro TTS<br/>Hinglish"]
  end

  LAYA["Laya router<br/>returns 4 fields only"]
  VAL{"Schema valid?"}
  ESC["ESCALATE<br/>beep.wav<br/>mute AI<br/>bridge laptop mic"]
  RT["Routing table<br/>R1, R2, R3, R4, R5, R6"]
  DRAFT["Draft-only<br/>human approves"]
  SEND["Auto-reply<br/>agent sends"]

  subgraph AG["MCP server — the only action surface"]
    T1["get_customer_profile"]
    T2["send_whatsapp_media"]
    T3["search_markdown_rag"]
    T4["handle_instagram_interaction"]
    T5["triage_and_reply_gmail"]
    T6["escalate_to_human"]
  end

  subgraph DB["Single datastore"]
    CUS[("customers")]
    TIX[("tickets")]
    EVT[("events<br/>append-only")]
    KB[("business_brain<br/>chunks")]
  end

  subgraph UI["Owner dashboard — 4 panels"]
    P1["1 Live Queue"]
    P2["2 Ticket Detail"]
    P3["3 Escalation Bay"]
    P4["4 Brain and Insights"]
  end

  JOB["Inngest worker<br/>weekly report, sweeper"]

  WA --> ADP
  IG --> ADP
  GM --> ADP
  VC --> PIPE
  ADP --> LAYA
  PIPE --> LAYA
  LAYA --> VAL
  VAL -->|"no — R7 fail safe"| ESC
  VAL -->|"yes"| RT
  RT -->|"R1–R4"| ESC
  RT -->|"R5"| DRAFT
  RT -->|"R6"| SEND
  DRAFT --> T
  SEND --> T
  ESC --> T6
  T1 --> CUS
  T2 --> TIX
  T3 --> KB
  T4 --> TIX
  T5 --> TIX
  T6 --> EVT
  CUS --> EVT
  TIX --> EVT
  DB --> UI
  JOB --> DB
  PIPE -.->|"live audio leg<br/>never dropped"| ESC
```

Only the part above `Routing table` runs on the voice path. **Text and voice share one classifier
and one retriever** — four channels, one brain, not four pipelines.

## Routing table — the decision surface

First match wins. `confidence_score` and `urgency` are integers 0–100.

| Rule | Condition | Outcome | Why it exists |
|---|---|---|---|
| **R1** | `intent = human_escalation` | escalate · `explicit_request` | The customer asked for a person |
| **R2** | `confidence_score < 50` | escalate · `low_confidence` | **The product.** A coin flip is never an answer |
| **R3** | `sentiment = distressed` | escalate · `distressed` | Distress outranks confidence |
| **R4** | `urgency ≥ 80` | escalate · `urgent` | Money and outages do not wait for a draft |
| **R5** | `50 ≤ confidence < 70` | draft-only | Good enough to draft, not to send |
| **R6** | `confidence ≥ 70`, `urgency < 80` | auto-reply | The repetitive volume, handled |
| **R7** | invalid output, no match, timeout | escalate · `invalid_decision` | A broken router is never a silent reply |

## State machines

**CALL** — the leg id is immutable and only terminal states release it. A transfer is not
discouraged, it is **unrepresentable**.

```mermaid
stateDiagram-v2
  [*] --> ringing
  ringing --> laya_route: leg accepted
  ringing --> missed: no answer
  laya_route --> specialist: valid, no rule
  laya_route --> escalation: R7 fail safe
  specialist --> escalation: R1–R4
  specialist --> resolved: AI resolves
  escalation --> human_takeover: owner bridges
  escalation --> resolved: customer hangs up
  human_takeover --> resolved: owner ends
  missed --> [*]
  resolved --> [*]
```

**TICKET** — note the absence of an `escalated → replied` edge. F9 is structural, not a policy
comment.

```mermaid
stateDiagram-v2
  [*] --> new
  new --> triaged: classified
  triaged --> replied: R6
  triaged --> escalated: R5 or R1–R4
  triaged --> closed: nothing to answer
  replied --> escalated: customer follows up
  replied --> closed
  escalated --> closed: owner closes
  closed --> [*]
```

## Data model — 4 entities

| Entity | Holds | Note |
|---|---|---|
| `customers` | phone, email, `plan_tier Free\|Pro`, `last_login`, `recent_orders`, `account_status` | `last_login` semantics **open** — no customer ever logs in (`AQ-19`) |
| `tickets` | channel, customer ref, state, intent, urgency, sentiment, confidence, `laya_raw`, escalation ref | One row per inbound contact, voice included |
| `events` | ticket/call ref, type, actor, payload, timestamp | **Append-only.** This is the audit log the dashboard reads |
| `business_brain.md` chunks | doc version, heading path, text, tokens, embedding ref | The markdown file is the source of truth; chunks are derived and rebuildable |

## Trust boundaries

| Boundary | Treated as | Consequence |
|---|---|---|
| Laya output | **Untrusted** — schema-validated before use | Invalid → R7 → beep. Never a coerced guess |
| Channel webhooks / Baileys session | Untrusted | Adapters normalize; nothing downstream sees raw provider payloads |
| Stored rows read back | Untrusted | An unknown state returns `ILLEGAL_TRANSITION`, never a thrown error |
| Tool results | Frozen envelopes | A caller cannot mutate a decision after the fact |
| The end customer | Never authenticated | Zero customer credentials exist to leak |

## Built today

| | |
|---|---|
| **Real** | Routing table R1–R7 · CALL + TICKET machines · typed tool envelope — 68 tests, 100% branch, mutation-checked |
| **Contract only** | 6 tool signatures, 4 entities, 4 panels, 2 jobs |
| **Not started** | Every network edge in the diagram above |

The README's *real vs mocked* table is the single source of truth for status; this document is the
shape, not the status.

## Export to PNG

```bash
# extract the system diagram, then render it
awk '/^```mermaid$/{n++} n==1 && !/^```/{print} /^```$/ && n==1 && NR>1 && f{exit} {if(/^```mermaid$/)f=1}' docs/ARCHITECTURE.md > /tmp/arch.mmd
npx -y @mermaid-js/mermaid-cli -i /tmp/arch.mmd -o docs/img/architecture.png -w 2400 -b "#0A0A0A"
```

Legibility check: the diagram must still read at **50% zoom**, because that is how it appears on a
slide and in Round 1's 30-minute screen.

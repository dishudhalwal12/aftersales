# PS 2.5 — Omnichannel AI Support & Triage Ecosystem ("AfterSales AI")
## Master Executable PRD & 4-Phase AI/Developer Build Specification (Team 41)

**Revision:** 4.0 (Ultra-Detailed AI-Executable Specification)  
**Status:** Hackathon MVP — Execution Ready  
**Updated:** 30 October 2026  
**Build Team:** Developer A (Frontend & UX) | Developer B (Backend, RAG, Channels & Sarvam Voice)  
**Localhost Base URL:** `http://localhost:3000` (Frontend & API Routes) / `http://localhost:8000` (Optional Python/Node API Server)  
**Voice Provider:** Sarvam AI (Shared rented virtual number + per-session business context injection)  
**Supersedes:** Revision 3 (`PS_2.5_Updated_PRD_4_Phases_Team41.md`) by preserving every invariant while adding exact routes, schemas, API payloads, prompts, and UI specs.

---

> ### ⚠ Decision 2026-10-31 — the landing page (overrides §1.3 and Phase 1 Task 1)
>
> **The front door is the saved page in `public/landing`. Do not build or substitute a landing page at `/`.**
>
> - `/` **must** keep serving that page through the `next.config.ts` rewrite to `/landing/index.html`
>   (its assets live under `public/landing/assets/...` and are referenced from the site root).
> - The whole public flow is: `/` → the page's **Go to Dashboard** button → `/auth` → sign in or
>   one-click judge demo → `/dashboard`.
> - Any landing page built from this PRD goes to **`/home`** and is never wired to `/`.
> - Do not delete the rewrite and do not add `src/app/page.tsx`. That was done once and reverted by
>   the owner — the saved page is the intended front door, not a placeholder.

---

## 0. Instructions for the AI Coding Agent (Read First)

You are building **AfterSales AI** for **SPHINX'26 Problem Statement 2.5 (AI Agent for Automated Customer Support and Ticket Triage)**. Follow these execution rules strictly:
1. **Build Sequentially in 4 Phases:** Complete Phase 1 $\rightarrow$ verify Phase 1 Gate $\rightarrow$ Phase 2 $\rightarrow$ verify Phase 2 Gate $\rightarrow$ Phase 3 $\rightarrow$ verify Phase 3 Gate $\rightarrow$ Phase 4 $\rightarrow$ verify Phase 4 Gate.
2. **Never Invent Mismatched Contracts:** Use the exact URL routes, database table/column names, and JSON request/response payloads defined in Sections 2, 3, and 5 of this document.
3. **Enforce All Hard Safety Invariants:**
   - Confidence $< 50$ must **never** trigger an automatic send under any circumstance.
   - Every auto-sent reply must cite at least one valid `chunk_id` retrieved from that specific business's knowledge base.
   - Business/tenant context (`business_id`) must always come from the authenticated server session or verified webhook mapping—never from raw LLM output.
   - Only the **Business Owner** logs into the web app. End customers never log in.

---

## 1. Product Overview, Visual Design System & Localhost URL Map

### 1.1 Product Summary
Small-business owners drown in repetitive queries across WhatsApp, Instagram, Gmail, and phone calls while missing urgent escalations. **AfterSales AI** provides:
1. **A High-Impact Landing Page (`http://localhost:3000/`)** featuring a hero demo/After Effects video container and 1-click authentication.
2. **A Frictionless Onboarding Wizard (`http://localhost:3000/onboarding`)** that captures 12 structured business facts (or `.md` uploads), compiles a versioned `business_brain.md` RAG index, and connects communication channels.
3. **A Multi-Tenant Command Dashboard (`http://localhost:3000/dashboard`)** with a Live Triage Queue, Ticket Detail Drawer, Business-Scoped AI Text Test Modal, Sarvam AI Voice Test Panel, and Weekly Sentiment & Recurring Complaints Insights (Hackathon Bonus Twist).

### 1.2 Visual Aesthetic & Design Tokens
- **Theme:** High-contrast Off-White & Jet-Black with Translucent Frosted-Glass panels (no generic purple gradients).
- **Color Palette:**
  - Background Primary: `#F8F8F6` (Warm Off-White)
  - Background Secondary / Cards: `rgba(255, 255, 255, 0.78)` with `backdrop-filter: blur(12px)` and `1px solid rgba(10, 10, 10, 0.08)`
  - Ink / Primary Text & Primary Buttons: `#0A0A0A` (Jet Black)
  - Muted Text: `#52525B` (Zinc 600)
  - Status Badges:
    - Sent / Grounded ($Confidence \ge 50$): Emerald (`#10B981` bg-opacity-15, text `#065F46`)
    - Draft Only: Amber (`#F59E0B` bg-opacity-15, text `#92400E`)
    - Escalated / Urgent ($Confidence < 50$ or $Urgency \ge 80$): Crimson (`#EF4444` bg-opacity-15, text `#991B1B`)

### 1.3 Complete Localhost URL Routing Map (`http://localhost:3000`)

| Route Path | Access | Screen Purpose & Redirect Logic |
| :--- | :--- | :--- |
| `/` | Public | **Landing Page:** Top navbar (Logo, Features, Sign In, Get Started), Hero section with custom `<video>` container (`public/videos/hero-demo.mp4` with fallback animated preview), 3-step How It Works, Live Architecture preview, and CTA buttons. If already authenticated, clicking "Go to Dashboard" routes to `/dashboard`. |
| `/auth` | Public | **Sign In / Sign Up Screen:** Tabs for Sign In & Create Account (Email + Password), **"Continue with Google"** OAuth button, and a **"1-Click Judge Demo Login"** button for instant testing. **Post-Auth Redirect Rule:** If user has no onboarded business $\rightarrow$ redirect to `/onboarding`. If user already has $\ge 1$ business $\rightarrow$ redirect to `/dashboard`. |
| `/onboarding` | Protected | **4-Step Business Onboarding Wizard:** Step 1: Core Identity & Tone; Step 2: Products, Pricing, Policies & FAQs (or `.md` file upload); Step 3: Escalation Rules & Contact Info; Step 4: Channel Connections (WhatsApp, Instagram, Gmail, Sarvam Voice). Includes **"Load Seeded Business A (SaaS)"** and **"Load Seeded Business B (D2C Clinic)"** 1-click buttons. On save $\rightarrow$ compiles `business_brain.md`, chunks vectors/BM25, and redirects to `/dashboard`. |
| `/dashboard` | Protected | **Main Command Dashboard:** Persistent top bar (Business Switcher dropdown, Global **"Test My AI Agent"** button, Demo Reset button, User Profile) + Left Sidebar switching between the 4 core panels below: |
| `/dashboard?tab=queue` | Protected | **Panel 1 — Live Queue & Ticket Detail:** Filterable omnichannel ticket list (`All`, `New`, `Triaged`, `Escalated`, `Replied`, `Closed`), urgency/sentiment/confidence badges, split-pane Ticket Detail timeline, and **AI Text Modal** (`Test Text Agent`). |
| `/dashboard?tab=voice` | Protected | **Panel 2 — Sarvam Voice Test & Escalation Status:** Business selector, verified callback phone input (`+91...`), **"Call Me Now"** button, live call state (`initiated` $\rightarrow$ `ringing` $\rightarrow$ `in_progress` $\rightarrow$ `completed` / `failed`), fallback 4-digit session PIN display, post-call transcript, duration, and escalation outcome. |
| `/dashboard?tab=brain` | Protected | **Panel 3 — Business Brain & Weekly Insights:** View/edit compiled `business_brain.md` chunks, inspect chunk IDs, and view the **Bonus Twist: Sentiment Tracker & Automated Weekly Recurring Complaints Report**. |
| `/dashboard?tab=channels` | Protected | **Panel 4 — Channel Connections & Readiness:** Truthful connection cards for WhatsApp, Instagram DM, Gmail, and Sarvam Voice showing `connected`, `test_mode`, `draft_only`, or `unavailable` states plus webhook simulator controls. |

---

## 2. Recommended Repository Structure

Use a clean Next.js (App Router, TypeScript, Tailwind CSS, Prisma + SQLite/PostgreSQL) full-stack structure so both Frontend (Developer A) and Backend API Routes (Developer B) run with a single `npm run dev` on `http://localhost:3000`:

```text
aftersales-ai/
├── prisma/
│   ├── schema.prisma              # Complete multi-tenant schema (Section 3)
│   └── seed.ts                    # Seeds Demo Business A & Business B + 50 sample tickets
├── public/
│   └── videos/
│       └── hero-demo.mp4          # Custom After Effects hero video slot
├── docs/
│   └── spikes/
│       └── SARVAM.md              # Phase 1 Sarvam context-passing spike documentation
├── src/
│   ├── app/
│   │   ├── page.tsx               # Landing Page (http://localhost:3000/)
│   │   ├── auth/
│   │   │   └── page.tsx           # Login / Signup / Google Auth / Judge Quick Login
│   │   ├── onboarding/
│   │   │   └── page.tsx           # 12-Question Wizard + .md upload + 1-click presets
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Unified 4-Panel Dashboard + AI Text & Voice Modals
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── businesses/route.ts
│   │       ├── businesses/[id]/brain/route.ts
│   │       ├── businesses/[id]/tickets/route.ts
│   │       ├── businesses/[id]/insights/route.ts
│   │       ├── ai/text-query/route.ts
│   │       ├── channels/webhook/[provider]/route.ts
│   │       └── voice/
│   │           ├── start-session/route.ts
│   │           ├── sarvam-context/route.ts
│   │           ├── sarvam-tool-search/route.ts
│   │           └── sarvam-webhook/route.ts
│   ├── components/
│   │   ├── landing/               # HeroVideoSection, FeatureGrid, Navbar
│   │   ├── onboarding/            # OnboardingWizard, ChannelCard
│   │   └── dashboard/             # LiveQueuePanel, TicketDetailDrawer, AiTextModal, VoiceTestPanel, BrainInsightsPanel
│   └── lib/
│       ├── db.ts                  # Prisma client singleton
│       ├── auth.ts                # Session helper & tenant ownership guard
│       ├── rag.ts                 # Markdown compiler, chunker, and business-scoped search_markdown_rag
│       ├── routing-engine.ts      # Deterministic R1-R7 rules & <50 confidence guard
│       ├── llm-orchestrator.ts    # OpenRouter/LLM classifier + specialist generator (general, technical, sales)
│       └── sarvam.ts              # Sarvam outbound call client & session resolver
├── .env.example
└── package.json
```

### 2.1 Environment Variables (`.env.example`)
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="hackathon-super-secret-key-team-41"
NEXTAUTH_URL="http://localhost:3000"

# LLM Provider (OpenRouter / OpenAI Compatible)
OPENROUTER_API_KEY="sk-or-v1-..."
LLM_MODEL_ID="meta-llama/llama-3.3-70b-instruct"

# Google OAuth (Optional fallback to Credentials if not set)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Sarvam AI Voice Configuration
SARVAM_API_KEY=""
SARVAM_AGENT_ID=""
SARVAM_VIRTUAL_NUMBER="+91XXXXXXXXXX"
PUBLIC_WEBHOOK_BASE_URL="https://your-cloudflare-tunnel.trycloudflare.com"
```

---

## 3. Complete Database Schema (`prisma/schema.prisma`)

Every table enforces strict `businessId` scoping so Business A can never read Business B's data.

```prisma
datasource db {
  provider = "sqlite" // Easily swappable to "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String     @id @default(cuid())
  email         String     @unique
  name          String?
  passwordHash  String?
  googleId      String?
  createdAt     DateTime   @default(now())
  businesses    Business[]
}

model Business {
  id                  String              @id @default(cuid())
  ownerId             String
  owner               User                @relation(fields: [ownerId], references: [id])
  name                String
  businessType        String              // e.g., "SaaS", "E-Commerce", "Healthcare Clinic"
  description         String
  productsServices    String              // JSON or Markdown text of catalog & prices
  hours               String
  returnPolicy        String
  faqs                String              // JSON array or Markdown FAQ pairs
  escalationEmail     String
  escalationPhone     String
  agentTone           String              @default("Warm, concise, and helpful")
  autoSendEnabled     Boolean             @default(true)
  compiledBrainMd     String              // Full normalized business_brain.md
  brainVersion        Int                 @default(1)
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  chunks              KnowledgeChunk[]
  channels            ChannelConnection[]
  tickets             Ticket[]
  voiceSessions       VoiceTestSession[]
}

model KnowledgeChunk {
  id          String   @id @default(cuid())
  businessId  String
  business    Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  chunkIndex  Int
  section     String   // e.g., "Pricing", "Return Policy", "FAQs", "Technical Troubleshooting"
  content     String
  keywords    String   // Lowercase comma-separated tokens for fast hybrid search
  createdAt   DateTime @default(now())

  @@index([businessId])
}

model ChannelConnection {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  channelType  String   // "WHATSAPP" | "INSTAGRAM" | "GMAIL" | "SARVAM_VOICE"
  status       String   // "CONNECTED" | "TEST_MODE" | "DRAFT_ONLY" | "UNAVAILABLE"
  autoSend     Boolean  @default(false)
  configJson   String?  // Encrypted metadata (never raw passwords)
  updatedAt    DateTime @updatedAt

  @@unique([businessId, channelType])
}

model Ticket {
  id                 String        @id @default(cuid())
  businessId         String
  business           Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  externalMessageId  String?       @unique // Prevents duplicate webhook processing
  channel            String        // "TEXT_MODAL" | "WHATSAPP" | "INSTAGRAM" | "GMAIL" | "VOICE"
  customerName       String
  customerHandle     String        // Email, phone number, or IG handle
  customerQuery      String
  state              String        // "new" | "triaged" | "replied" | "escalated" | "closed"
  specialistAssigned String        // "general" | "technical" | "sales"
  intent             String
  sentiment          String        // "positive" | "neutral" | "frustrated" | "distressed"
  urgencyScore       Int           // 0 to 100
  confidenceScore    Int           // 0 to 100
  actionStatus       String        // "answered" | "draft" | "escalated" | "failed"
  routingRuleHit     String        // "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7"
  aiDraftOrReply     String
  citedChunkIds      String        // JSON array of KnowledgeChunk IDs e.g. '["chk_1", "chk_2"]'
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  events             TicketEvent[]

  @@index([businessId, state])
}

model TicketEvent {
  id         String   @id @default(cuid())
  ticketId   String
  ticket     Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  eventType  String   // "INBOUND_RECEIVED" | "RAG_RETRIEVED" | "ROUTING_DECIDED" | "AUTO_SENT" | "DRAFT_SAVED" | "ESCALATED"
  payload    String   // JSON details of the step
  createdAt  DateTime @default(now())
}

model VoiceTestSession {
  id                  String   @id @default(cuid())
  businessId          String
  business            Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  demoPin             String   // 4-digit fallback code e.g. "4821"
  judgePhone          String
  status              String   // "initiated" | "ringing" | "in_progress" | "completed" | "failed"
  sarvamInteractionId String?
  transcript          String?
  durationSeconds     Int?
  escalationOutcome   String?  // "resolved_by_ai" | "escalated_to_owner"
  expiresAt           DateTime
  createdAt           DateTime @default(now())

  @@index([businessId])
  @@index([judgePhone, status])
}
```

---

## 4. AI Retrieval, Specialist Orchestration & Deterministic Routing (R1–R7)

### 4.1 Business-Scoped Retrieval (`search_markdown_rag`)
1. When onboarding is saved or updated, compile a clean Markdown document (`compiledBrainMd`) with explicit `## Section` headers and split it into `KnowledgeChunk` records ($150\text{–}300$ words each) tagged with `businessId`.
2. When a query arrives for `businessId`, run `search_markdown_rag(businessId, query, topK = 4)`:
   - **Hard Filter:** `WHERE businessId = :authenticatedBusinessId` (never query across businesses).
   - Score chunks using keyword/BM25 overlap + semantic similarity against `content` and `section`.
   - Return top matching chunks with `{ id, section, content, score }`.

### 4.2 Single-Pass Structured LLM Prompt (Classifier + Specialist Answer)
Pass the retrieved chunks and customer query to the LLM (`response_format: { type: "json_object" }`):

```text
SYSTEM PROMPT:
You are the internal AI Support & Triage Engine for "{business.name}" ({business.businessType}).
Tone: {business.agentTone}.

CRITICAL GROUNDING RULES:
1. You may ONLY use facts explicitly present in the PROVIDED KNOWLEDGE CHUNKS below.
2. Never invent prices, policies, hours, links, or technical steps.
3. Select the best internal runtime specialist:
   - "general": FAQs, hours, policies, order/appointment inquiries.
   - "technical": troubleshooting, bug reports, setup steps, usage help.
   - "sales": pricing comparisons, plan upgrades, product recommendations, discounts.
4. Output strictly valid JSON matching this schema:
{
  "specialist": "general" | "technical" | "sales",
  "intent": "string (short label e.g. refund_policy, pricing_inquiry, technical_bug)",
  "sentiment": "positive" | "neutral" | "frustrated" | "distressed",
  "urgency_score": number (0 to 100),
  "confidence_score": number (0 to 100, MUST be < 50 if chunks do not directly answer the question),
  "explicit_human_request": boolean (true if user asks for a person/human/agent/manager),
  "requires_human_judgment": boolean (true if user reports severe distress, legal threat, billing dispute, or safety issue),
  "cited_chunk_ids": ["array of exact chunk IDs used to form the answer, empty [] if none match"],
  "reply_text": "Grounded response to the customer, or a polite escalation/clarification message if confidence < 50"
}
```

### 4.3 Deterministic Routing Engine (`src/lib/routing-engine.ts`)
Never trust the LLM to decide whether a message is auto-sent. Run this exact deterministic evaluation in TypeScript/Python after receiving the LLM JSON:

```typescript
export function evaluateRoutingRules(input: {
  llmResult: LLMResponse | null;
  validChunkIdsForBusiness: Set<string>;
  channelAutoSendAllowed: boolean;
  runtimeError?: boolean;
}): {
  ruleHit: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
  actionStatus: "answered" | "draft" | "escalated" | "failed";
  ticketState: "triaged" | "replied" | "escalated";
  shouldAutoSend: boolean;
} {
  // R7: Classifier, provider, tool, or runtime failure -> fail safe; do not auto-send
  if (input.runtimeError || !input.llmResult) {
    return { ruleHit: "R7", actionStatus: "failed", ticketState: "escalated", shouldAutoSend: false };
  }

  const {
    confidence_score,
    urgency_score,
    explicit_human_request,
    requires_human_judgment,
    sentiment,
    cited_chunk_ids,
  } = input.llmResult;

  // Verify cited chunks actually belong to this business
  const verifiedChunks = (cited_chunk_ids || []).filter((id) =>
    input.validChunkIdsForBusiness.has(id)
  );

  // R1: Customer explicitly asks for a human -> escalate
  if (explicit_human_request) {
    return { ruleHit: "R1", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R2: Confidence < 50 OR zero verified retrieved chunks -> do not auto-send; escalate
  if (confidence_score < 50 || verifiedChunks.length === 0) {
    return { ruleHit: "R2", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R3: Distress / complaint requiring human judgment -> escalate
  if (requires_human_judgment || sentiment === "distressed") {
    return { ruleHit: "R3", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R4: Urgency >= 80 -> escalate
  if (urgency_score >= 80) {
    return { ruleHit: "R4", actionStatus: "escalated", ticketState: "escalated", shouldAutoSend: false };
  }

  // R5: Channel configured draft-only -> draft, do not send
  if (!input.channelAutoSendAllowed) {
    return { ruleHit: "R5", actionStatus: "draft", ticketState: "triaged", shouldAutoSend: false };
  }

  // R6: Eligible grounded answer (Confidence >= 50 AND >=1 verified chunk AND Urgency < 80)
  return { ruleHit: "R6", actionStatus: "answered", ticketState: "replied", shouldAutoSend: true };
}
```

---

## 5. Frozen REST API Contracts (Frontend $\leftrightarrow$ Backend)

### 5.1 `POST /api/businesses` (Save Onboarding & Compile Brain)
- **Request:**
```json
{
  "name": "CloudPulse CRM",
  "businessType": "SaaS",
  "description": "Inventory & GST billing software for retail shops.",
  "productsServices": "Starter Plan: ₹499/mo (1 user). Pro Plan: ₹1,499/mo (5 users, WhatsApp invoicing, API access).",
  "hours": "Mon-Sat, 9:00 AM to 7:00 PM IST",
  "returnPolicy": "Full refund within 7 days of initial subscription if fewer than 10 invoices generated.",
  "faqs": "Q: How do I export GST GSTR-1? A: Go to Reports > GST > Click Export JSON.",
  "escalationEmail": "founder@cloudpulse.in",
  "escalationPhone": "+919876543210",
  "agentTone": "Clear, helpful, and professional",
  "rawMarkdownUpload": ""
}
```
- **Response (`201 Created`):**
```json
{
  "businessId": "biz_cloudpulse_01",
  "name": "CloudPulse CRM",
  "brainVersion": 1,
  "chunkCount": 6
}
```

### 5.2 `POST /api/ai/text-query` (Judge Text AI Modal & Queue Responder)
- **Security Invariant:** `businessId` is validated against the logged-in user's session ownership.
- **Request:**
```json
{
  "businessId": "biz_cloudpulse_01",
  "customerName": "Judge Tester",
  "customerHandle": "judge@sphinx.mnit.ac.in",
  "channel": "TEXT_MODAL",
  "query": "What is the price of the Pro Plan and does it include WhatsApp invoicing?"
}
```
- **Response (`200 OK`):**
```json
{
  "ticketId": "tkt_991",
  "businessId": "biz_cloudpulse_01",
  "specialist": "sales",
  "intent": "pricing_inquiry",
  "sentiment": "neutral",
  "urgencyScore": 20,
  "confidenceScore": 94,
  "actionStatus": "answered",
  "routingRuleHit": "R6",
  "shouldAutoSend": true,
  "answer": "The Pro Plan is ₹1,499/month and includes support for up to 5 users, WhatsApp invoicing, and API access.",
  "sources": [
    {
      "chunkId": "chk_cp_02",
      "section": "Products & Pricing",
      "excerpt": "Pro Plan: ₹1,499/mo (5 users, WhatsApp invoicing, API access)."
    }
  ]
}
```

### 5.3 `POST /api/voice/start-session` (Initiate Sarvam Personalized Call)
- **Request:**
```json
{
  "businessId": "biz_cloudpulse_01",
  "judgePhone": "+919812345678"
}
```
- **Response (`200 OK`):**
```json
{
  "sessionId": "vsess_7721",
  "businessId": "biz_cloudpulse_01",
  "businessName": "CloudPulse CRM",
  "demoPin": "4821",
  "status": "initiated",
  "contextInjectionMode": "PER_CALL_VARIABLES"
}
```

### 5.4 `POST /api/voice/sarvam-tool-search` (Called by Sarvam Agent Mid-Call)
- **Request:**
```json
{
  "sessionId": "vsess_7721",
  "demoPin": "4821",
  "callerPhone": "+919812345678",
  "query": "What is your refund policy?"
}
```
- **Response (`200 OK`):**
```json
{
  "businessName": "CloudPulse CRM",
  "groundedFacts": "Full refund within 7 days of initial subscription if fewer than 10 invoices generated.",
  "citedChunkIds": ["chk_cp_04"],
  "confidenceScore": 92,
  "escalateToHuman": false
}
```

---

## 6. Four-Phase Execution Plan & Verification Gates

### Phase 1 — Foundation, Landing Page, Onboarding & Contracts
**Goal:** A judge visits `http://localhost:3000/`, watches the hero preview, signs in, completes or seeds business onboarding, and lands on `/dashboard`. Sarvam context injection is verified.

#### Developer A — Frontend Tasks
- [ ] Build `src/app/page.tsx` (Landing Page): Off-white/black glassmorphic theme, `<video>` slot for the After Effects demo video, feature cards, and "Sign In" / "Continue with Google" CTA buttons.
- [ ] Build `src/app/auth/page.tsx`: Email/password login, Google Auth button, and "1-Click Judge Demo Login" button with automatic redirect (`/onboarding` if new, `/dashboard` if onboarded).
- [ ] Build `src/app/onboarding/page.tsx`: 4-step wizard + `.md` file upload + 1-click preset buttons for **Business A (CloudPulse SaaS)** and **Business B (Jaipur Smile Dental Clinic)**.
- [ ] Build `src/app/dashboard/page.tsx` shell with Business Switcher dropdown in the navbar, **"Test My AI Agent"** header CTA, and the 4 sidebar tabs (`Live Queue`, `Voice Test`, `Business Brain & Insights`, `Channels`).

#### Developer B — Backend Tasks
- [ ] Initialize Prisma with `schema.prisma` (Section 3), run `npx prisma db push`, and build `prisma/seed.ts` with Business A & Business B.
- [ ] Implement session authentication and `assertBusinessOwnership(userId, businessId)` middleware.
- [ ] Implement `GET /api/health`, `GET/POST /api/businesses`, and `GET /api/businesses/[id]/brain`.
- [ ] Execute the Sarvam AI feasibility spike and document the exact per-call context mechanism (custom metadata variables vs. caller-phone active session lookup vs. 4-digit `demoPin`) in `docs/spikes/SARVAM.md`.

**Phase 1 Gate Verification:**
- Visiting `http://localhost:3000/` renders the Landing Page; signing in redirects to `/onboarding` or `/dashboard`.
- Onboarding data persists in SQLite/Postgres across browser refreshes.
- `docs/spikes/SARVAM.md` contains a clear GREEN/RED verdict for per-call context passing.

---

### Phase 2 — Business Brain, RAG & AI Text Modal
**Goal:** Judges can switch between Business A and Business B in `/dashboard`, open the **AI Text Modal**, ask questions, and see grounded answers with chunk citations or safe escalations when confidence $< 50$.

#### Developer A — Frontend Tasks
- [ ] Build the **AI Text Modal** (`AiTextModal.tsx`) showing query input, specialist badge (`general` / `technical` / `sales`), confidence meter ($0\text{–}100$), urgency meter, routing rule badge (`R1`–`R7`), action status pill (`answered`, `draft`, `escalated`, `failed`), and expandable source chunk cards.
- [ ] Build the **Live Queue Panel** (`LiveQueuePanel.tsx`) and **Ticket Detail Drawer** (`TicketDetailDrawer.tsx`).
- [ ] Build the **Business Brain & Insights Panel** (`BrainInsightsPanel.tsx`) displaying compiled `business_brain.md` chunks and the Weekly Recurring Complaints + Sentiment summary cards.

#### Developer B — Backend Tasks
- [ ] Implement `src/lib/rag.ts`: Markdown chunker and `search_markdown_rag(businessId, query)` with strict `businessId` filtering.
- [ ] Implement `src/lib/llm-orchestrator.ts` and `src/lib/routing-engine.ts` enforcing Rules `R1`–`R7` and the hard $< 50$ confidence block.
- [ ] Implement `POST /api/ai/text-query`, `GET /api/businesses/[id]/tickets`, and `GET /api/businesses/[id]/insights`.
- [ ] Write automated tests proving Business A never retrieves Business B chunks and confidence `49` never sets `shouldAutoSend: true`.

**Phase 2 Gate Verification:**
- Asking *"What is the Pro Plan price?"* under Business A returns `₹1,499/mo` with chunk citation `chk_cp_02`.
- Asking the exact same question under Business B (Dental Clinic) returns `escalated` ($Confidence < 50$, Rule `R2`) because Business B has no software Pro Plan.

---

### Phase 3 — Channel Integrations, Webhooks & Live Queue
**Goal:** At least one real/test external channel (e.g., Gmail or WhatsApp/Instagram webhook) processes an inbound message end-to-end into the Live Queue with idempotency; unverified channels clearly show `draft_only` or `test_mode`.

#### Developer A — Frontend Tasks
- [ ] Build `ChannelsPanel.tsx` with truthful connection status badges (`CONNECTED`, `TEST_MODE`, `DRAFT_ONLY`, `UNAVAILABLE`).
- [ ] Add a **"Simulate Inbound Webhook"** test bar (for WhatsApp, Instagram DM, and Gmail) alongside real webhook listeners so judges can trigger instant channel events and test duplicate webhook deduplication on screen.
- [ ] Add "Approve & Send Draft" and "Resolve Escalation" buttons inside the Ticket Detail Drawer.

#### Developer B — Backend Tasks
- [ ] Implement `POST /api/channels/webhook/[provider]` with `externalMessageId` idempotency check (ignoring duplicate webhooks safely).
- [ ] Connect inbound webhook payloads to `search_markdown_rag` $\rightarrow$ `evaluateRoutingRules` $\rightarrow$ `Ticket` + `TicketEvent` creation.
- [ ] Implement weekly sentiment & recurring complaints aggregator (`GET /api/businesses/[id]/insights`) grouping tickets by `intent` and `sentiment`.

**Phase 3 Gate Verification:**
- Firing the same webhook twice with identical `externalMessageId` creates exactly 1 ticket and 1 response.
- Channels configured as `DRAFT_ONLY` trigger Rule `R5` (`actionStatus: "draft"`, `shouldAutoSend: false`).

---

### Phase 4 — Sarvam Voice Integration, Hardening & Judge Walkthrough
**Goal:** A judge selects Business A or Business B on `/dashboard?tab=voice`, enters their phone number, clicks **"Call Me Now"**, and speaks to the Sarvam voice agent grounded in that specific business's knowledge base.

#### Developer A — Frontend Tasks
- [ ] Build `VoiceTestPanel.tsx` with Business Selector, phone number input (`+91...`), **"Call Me Now"** CTA, live status stepper (`Initiated` $\rightarrow$ `Ringing` $\rightarrow$ `In Progress` $\rightarrow$ `Completed`), prominent 4-digit `demoPin` badge, and post-call transcript + escalation card.
- [ ] Add a **"Reset Demo State"** button in the navbar to clean temporary test tickets before judging rounds.

#### Developer B — Backend Tasks
- [ ] Implement `POST /api/voice/start-session`: validates ownership, creates `VoiceTestSession` with a 10-minute expiry, binds `judgePhone` and `demoPin` to `businessId`, and triggers the Sarvam outbound call API.
- [ ] Implement `POST /api/voice/sarvam-tool-search`: resolves the active `VoiceTestSession` (via `sessionId`, `callerPhone`, or `demoPin`), runs `search_markdown_rag(session.businessId, query)`, and returns grounded business facts to the Sarvam voice agent.
- [ ] Implement `POST /api/voice/sarvam-webhook`: receives call completion payload, saves transcript, duration, and interaction ID, and creates an escalation ticket in the Live Queue if the caller asked for a human or was unresolved.

**Phase 4 Gate Verification:**
- Testing voice with Business A answers using CloudPulse SaaS facts; testing immediately after with Business B answers using Jaipur Smile Dental Clinic facts on the same shared Sarvam phone number.
- Completed call transcript, duration, and status automatically appear in the dashboard.

---

## 7. Pre-Written Seed Data for Instant Testing (`prisma/seed.ts`)

Use these two distinct businesses in `prisma/seed.ts` so every acceptance test (especially cross-tenant isolation and voice personalization) can be demonstrated immediately:

| Field | Business A: `CloudPulse CRM` (B2B SaaS) | Business B: `Jaipur Smile Studio` (Healthcare Clinic) |
| :--- | :--- | :--- |
| **`businessId`** | `biz_cloudpulse_01` | `biz_jaipursmile_02` |
| **Products & Prices** | Starter: ₹499/mo (1 user). Pro: ₹1,499/mo (5 users, WhatsApp billing, GST API). | Routine Scaling & Polishing: ₹1,200. Root Canal Treatment (RCT): ₹4,500 per tooth. Ceramic Crown: ₹6,000. |
| **Hours** | Mon–Sat, 9:00 AM – 7:00 PM IST | Tue–Sun, 10:00 AM – 8:00 PM IST (Closed Mondays) |
| **Refund / Cancellation** | 7-day full refund if $< 10$ invoices created. | Free appointment rescheduling up to 4 hours before slot; ₹300 no-show fee. |
| **Technical / Special FAQ** | To export GSTR-1 JSON: Go to `Reports > GST > Export JSON`. | Post-extraction care: Bite on gauze for 45 mins; no hot food or spitting for 24 hours. |

---

## 8. 12 Mandatory Acceptance Tests Checklist

1. **Landing & Auth Redirect (`AT-01`):** Opening `http://localhost:3000/` shows the Landing Page with hero video slot; signing in routes to `/onboarding` (if no business) or `/dashboard` (if onboarded).
2. **Onboarding Persistence (`AT-02`):** Saving business name, FAQs, services, and policies persists across page reloads and compiles versioned `KnowledgeChunk` rows.
3. **Text Personalization (`AT-03`):** Asking *"What are your prices and hours?"* in the Text Modal returns ₹499/₹1,499 (Mon–Sat) for Business A and ₹1,200/₹4,500 (Closed Mondays) for Business B.
4. **Voice Personalization (`AT-04`):** Triggering a Sarvam call for Business A vs. Business B on the shared virtual number answers with the respective business's facts without mutating the shared saved prompt.
5. **Strict Tenant Isolation (`AT-05`):** Authenticated User A cannot query, view, or trigger voice sessions for User B's `businessId` (`403 Forbidden`).
6. **Confidence Boundary (`AT-06`):** Confidence `49` triggers Rule `R2` (`actionStatus: "escalated"`, `shouldAutoSend: false`); confidence $\ge 50$ with valid chunks follows policy.
7. **High Urgency Escalation (`AT-07`):** Any query scored with `urgencyScore >= 80` triggers Rule `R4` and escalates immediately.
8. **Explicit Human Request (`AT-08`):** Saying *"Let me talk to a real human manager"* triggers Rule `R1` and escalates immediately.
9. **RAG Groundedness (`AT-09`):** Every auto-sent reply (`actionStatus: "answered"`) includes a non-empty `citedChunkIds` array verified against that business's chunks.
10. **Webhook Idempotency (`AT-10`):** Sending the same channel webhook payload twice with the same `externalMessageId` produces only one ticket and one action.
11. **Failure Safety (`AT-11`):** Disconnecting the LLM API key or Sarvam API key triggers Rule `R7` (`actionStatus: "failed"`, `shouldAutoSend: false`) and never fakes a successful send.
12. **Zero Secret Leakage (`AT-12`):** No API keys, OAuth secrets, or raw social passwords exist in client-side bundles or console logs.
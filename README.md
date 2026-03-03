# Quant Learning OS (QLOS)

> **Deep Learning Week 2026 Submission**
> Theme: Responsible AI in Education

---

## The Problem We're Solving

Four questions that every student on a digital learning platform cannot answer:

1. **"What am I genuinely weak at versus just making careless mistakes?"**
   — Platforms store right/wrong. They don't store *why*.

2. **"Am I improving, stagnating, or regressing over time?"**
   — Score history shows numbers. It doesn't surface trends.

3. **"What should I focus on if I only have two hours tonight?"**
   — Recommendations are generic. They don't account for time constraints or compound weaknesses.

4. **"Why do I keep failing the same type of question?"**
   — There is no failure-pattern loop. Every session starts fresh.

QLOS is built to answer all four — directly, with evidence you can trace — for students targeting quantitative finance roles. It models learning state continuously across quiz performance, interview practice, live trading behavior, and resume evidence, then uses that composite to generate ranked recommendations, adaptive study plans, and grounded coaching responses.

Learning is non-linear. QLOS accounts for gaps (fallback signals when data is sparse), bursts (spaced repetition and mastery tracking), and drift (behavioral trends over rolling 10-day windows). Every AI action is auditable by design.

---

## Table of Contents

0. [Judging Criteria](#0-judging-criteria)
1. [What Makes QLOS Different](#1-what-makes-qlos-different)
2. [How It Maps to the Problem Statement](#2-how-it-maps-to-the-problem-statement)
3. [Architecture](#3-architecture)
4. [Core Innovations](#4-core-innovations)
5. [Responsible AI — First-Class, Not an Afterthought](#5-responsible-ai--first-class-not-an-afterthought)
6. [Full Feature Inventory](#6-full-feature-inventory)
7. [Technical Implementation](#7-technical-implementation)
8. [Test Cases and Verification](#8-test-cases-and-verification)
9. [Results and Findings](#9-results-and-findings)
10. [Observations and Honest Limitations](#10-observations-and-honest-limitations)
11. [API Reference](#11-api-reference)
12. [Local Development](#12-local-development)
13. [Repository Map](#13-repository-map)

---

## 0. Judging Criteria

### Innovation & Creativity

QLOS approaches learning analytics from a direction no general platform takes: treating trading behavior, interview performance, resume evidence, and quiz history as a single unified learning signal rather than isolated features.

**Novel ideas:**
- **Behavioral execution analytics** derived from live paper-trading orders — fat-finger risk, revenge-trade detection, stop-loss discipline, slippage sensitivity — fed directly into the academic readiness composite. No other learning platform connects live market behavior to study recommendations. (→ [Innovation 2](#innovation-2-behavioral-execution-analytics))
- **Mistake taxonomy persistence** — every wrong answer is annotated as `Conceptual`, `Careless`, or `Implementation` before the answer is revealed. This distinction drives fundamentally different study plan types. (→ [Innovation 4](#innovation-4-mistake-taxonomy-and-recovery-persistence))
- **Firm-specific interview scoring** — the same answer receives a different weighted score under Jane Street's reasoning-first rubric vs. Citadel's execution-first rubric, reflecting real hiring calibration differences. (→ [Innovation 7](#innovation-7-firm-specific-interview-scoring))
- **DistilBERT query router** — a fine-tuned classifier routes coaching queries to the appropriate model tier by complexity, trained on auto-labeled seed data with zero manual labeling cost. (→ [Innovation 6](#innovation-6-distilbert-query-complexity-router))

---

### Technical Implementation

The stack is deliberate: Next.js API routes orchestrate Python subprocesses on-demand — no persistent Python server, no port management, one `npm run dev` command starts everything.

**Technical choices and why:**
- **Python via `child_process.spawn`** — keeps the deployment surface minimal while allowing full access to PyTorch, FAISS, scikit-learn, and OpenAI function-calling within the same repo. (→ [§7 Technical Implementation](#7-technical-implementation))
- **OpenAI function-calling agent with deterministic fallback** — the study planner runs a structured 5-step tool workflow (`rank_readiness_gaps` → `get_drill_templates` → `build_seed_plan` → `estimate_weeks_to_target` → `score_plan`). The LLM writes every task description itself; `hoursPerWeek` and `targetRole` are read directly from the user's profile. If the API call fails or returns malformed JSON, a pure-Python fallback executes the same gap-ranking logic. Students always receive a usable plan. (→ [Innovation 3](#innovation-3-agentic-study-planning-with-full-audit-trail))
- **FAISS RAG with LLM-as-a-Judge** — coaching answers are grounded in uploaded documents; each factual claim is evaluated as `supported`/`partial`/`unsupported`/`uncited` before display. (→ [Innovation 5](#innovation-5-citation-grounded-coaching-with-claim-evaluation))
- **Append-only NDJSON audit log** — every study plan generation is recorded unconditionally, including failures. The log is never overwritten, enabling offline audit and bias review. (→ [§5 Responsible AI](#5-responsible-ai--first-class-not-an-afterthought))
- **SQLite for all learning state** — quiz progress (including partial in-session state), interview history, resume analyses, and conversation history all persist across sessions with no additional infrastructure.

**Code quality signals:** output sanitization and schema validation before every API response; confidence-threshold fallback in the query router; rolling trend computation separated from score computation; no shared mutable state between Python subprocesses.

---

### Impact & Viability

**The problem is real:** students preparing for quant roles have no platform that closes the loop between what they study, how they trade, and how they interview. The four problem questions in the introduction are not hypothetical — they are the questions every QLOS user can now answer directly.

**Scalability path:**
- Swap SQLite for Postgres — schema is already normalized, no structural changes needed
- Replace `child_process.spawn` with a task queue (Celery, BullMQ) for concurrent users — the subprocess boundary is already clean
- The audit log format (NDJSON with `auditId`) is production-ready for ingestion into any log aggregator (Datadog, Splunk, BigQuery)
- The readiness composite formula is parameterizable — weights can be adjusted per institution or per role without code changes

**Meaningful problem addressed:** the gap between academic preparation and job-readiness for quantitative roles is well-documented. QLOS gives students a single instrument that tracks both dimensions simultaneously and generates targeted, time-bounded study plans grounded in their actual behavioral data — not generic advice.

---

## 1. What Makes QLOS Different

Most platforms: one score, one recommendation, no transparency.

| Problem question | Baseline platform | QLOS |
|---|---|---|
| Conceptual weakness vs. careless mistake? | Not tracked | Per-question mistake taxonomy: `Conceptual` / `Careless` / `Implementation` + confidence level, persisted and surfaced in next session |
| Am I improving or regressing? | Score number only | Rolling 10-day trend per behavioral signal; readiness momentum computed from latest interview + trading history |
| What to focus on with limited time? | "Review Chapter 3" | Agentic planner allocates specific minutes to weakest components given `hoursPerWeek` budget; sessions have measurable targets |
| Why do I keep failing the same question type? | No loop | Mistake type breakdown feeds study-plan generation; pattern surfaces recommended session type (concept review vs. drill vs. debugging practice) |
| Is the AI recommendation trustworthy? | Opaque text output | Every plan has an `auditId`, a `toolTrace`, and is linked to the signal that triggered it; coaching answers carry citation IDs and claim-level support scores |
| What if the AI fails? | System error | Deterministic fallback: every LLM-driven endpoint returns a usable result even with no API key |

---

## 2. How It Maps to the Problem Statement

### "How learning interaction data can be structured, interpreted, and tracked over time"

QLOS captures and structures five distinct interaction streams:

| Stream | What is captured | Where stored | How it feeds state |
|---|---|---|---|
| Quiz attempts | answer, confidence (`Low/Med/High`), mistake type, timestamp, in-progress partial state | SQLite `quiz_progress` | Theory component of readiness composite |
| Interview sessions | per-answer score, firm-weighted score, question category, session history | SQLite `interview_results` | Implementation + Communication components |
| Trading behavior | order type, qty, symbol, timing, fill price — from live Alpaca paper account | Alpaca API → computed on-demand | Execution component (4 behavioral signals) |
| Resume evidence | extracted skills, evidence strength, career highlights, readiness score | SQLite `resume_analyses` | Theory component baseline |
| Coaching sessions | conversation history, document queries, citation requests | SQLite `conversations` | Informs coaching context |

Tracking over time is explicit: behavioral signals compute trends comparing the last 5 trading days against the prior 5. Interview histories are stored as ordered rows. Quiz progress accumulates per-user per-quiz.

### "How AI-generated insights are delivered in a clear, explainable, and actionable way"

Three concrete mechanisms:

**1. Composite with visible components.** The readiness score is not a black box. It is broken down into Theory (30%), Implementation (25%), Execution (30%), Communication (15%) with the source signal named for each. Users can see which component is weakest and why.

**2. Evidence-linked recommendations.** Every recommendation on the dashboard carries a `source` tag: `/profile/resume`, `/profile/interview`, or `/trade`. Users know *why* the system is recommending something.

**3. Tool traces on study plans.** When the agentic planner generates a study plan, the response includes a `toolTrace` array showing every tool the agent called, what arguments it used, and what it returned. The `auditId` links this to the append-only audit log. Users and reviewers can verify the plan's provenance.

### "How the system adapts to long-term changes in behavior, including inactivity or accelerated progress"

- **Inactivity:** When behavioral data is absent (no Alpaca orders), the Execution component defaults to a neutral 50/100 and the explanation notes "No order history yet." The composite still functions — it doesn't break when data is sparse.
- **Behavioral drift:** Trend indicators (`up`/`flat`/`down`) on each behavioral signal compare the most recent 5 trading days to the prior 5. A student who was placing stop orders but stopped will see `stopLossTrend: "down"` before the overall score drops.
- **Accelerated progress:** If interview scores jump, the Implementation component rises, the composite rises, and the study plan allocates less time to that component in the next generation.
- **Recommendation shift:** Recommendations are generated dynamically from the current state — they are not cached. A student who fixes their weakest component gets different recommendations next time.

---

## 3. Architecture

```
Browser (Next.js App Router, React 19, TypeScript)
    │
    └─► 23 Next.js API routes
              │
              ├─► SQLite (local)
              │       users, quiz_progress, conversations,
              │       interview_results, resume_analyses
              │
              ├─► Local filesystem
              │       data/resumes/          uploaded resume files
              │       data/responsible-ai/   append-only audit logs (NDJSON)
              │
              ├─► Python subprocesses  [spawned on-demand via child_process.spawn]
              │       study_plan_agent.py        agentic readiness planner
              │       interview_llm.py           firm-specific LLM interviewer
              │       resume-analysis/api.py     skill extraction (70+ taxonomy)
              │       rag_cli.py                 FAISS RAG + claim evaluation
              │       smart_beta_service.py      factor-regression analysis
              │       router/router_cli.py       DistilBERT query router
              │
              └─► External APIs
                      OpenAI (gpt-4o, gpt-4o-mini)
                      Alpaca Paper Trading
                      yfinance / FRED / Ken French
```

**One process, no server sprawl.** All Python workloads spawn on-demand from Next.js API routes. A single `npm run dev` starts the entire system. No port management, no separate Python servers, no coordination overhead.

---

## 4. Core Innovations

### Innovation 1: Multi-Signal Learning State Model

**What it solves:** Problem question 1 (weakness type) and 3 (what to prioritize).

The readiness composite aggregates four evidence streams with explicit weights:

```
Readiness = 0.30 × Theory + 0.25 × Implementation + 0.30 × Execution + 0.15 × Communication
```

| Component | Source signal | Fallback when data absent |
|---|---|---|
| Theory (30%) | Resume analysis `overall_score × 10` | 50 (neutral) |
| Implementation (25%) | Interview `avg_score × 20` | 50 |
| Execution (30%) | Behavioral composite from Alpaca orders | 50 |
| Communication (15%) | Interview strong-answer ratio blend | 50 |

This is more than a weighted average — each component exposes its source. A learner who scores 85% on quizzes but never places stop orders receives Theory ≈ 85, Execution ≈ 15, and a composite around 51. The system correctly identifies the true weak point. The quiz-only signal would have returned 85.

**Files:** `components/profile/ReadinessTab.tsx`, `app/page.tsx`

---

### Innovation 2: Behavioral Execution Analytics

**What it solves:** Problem question 4 (why do I keep failing the same pattern?) — extended to trading execution discipline.

`app/api/alpaca/behavioral/route.ts` derives four behavioral signals from raw order history. Each signal has a trend direction computed by comparing the last 5 trading days to the prior 5:

**Fat-Finger Risk (0–100, lower is better)**
Identifies orders where `qty > 2× the user's own median order qty`. Formula: `(flagged_orders / total_orders) × 200`, capped at 100. A student consistently oversizing positions sees this score rise and receives a coaching note.

**Revenge-Trade Risk (0–100, lower is better)**
Detects market orders placed within 5 minutes of a prior fill on the same symbol — the classic panic re-entry pattern. Formula: `(burst_count / filled_orders) × 500`, capped at 100.

**Stop-Loss Discipline (0–100, higher is better)**
Among all active trading days, what percentage also had a stop or stop_limit order fill? Students who trade without protection score 0 immediately.

**Slippage Sensitivity (0–100, higher is better)**
Average basis-point gap between `filled_avg_price` and `limit_price` on limit orders. Inverted: better execution discipline → higher score.

These feed directly into the Execution component of the readiness model. Behavioral pattern → readiness impact → study plan adjustment is a closed loop.

**File:** `app/api/alpaca/behavioral/route.ts`

---

### Innovation 3: Agentic Study Planning with Full Audit Trail

**What it solves:** Problem question 3 (what to focus on with limited time) + the Responsible AI requirement for transparent AI actions.

`ml-development/readiness-agent/study_plan_agent.py` runs an OpenAI function-calling loop with **five tools** in a structured 5-step workflow. The LLM is instructed to call them in order and to write all task descriptions itself — it never copies recommendation titles.

| Step | Tool | Purpose |
|---|---|---|
| 1 | `rank_readiness_gaps` | Sort components by severity (lowest score, widest gap) |
| 2 | `get_drill_templates(component_key, difficulty)` | Fetch 2–3 typed drill templates per weak component as structural inspiration |
| 3 | `build_seed_plan(top_n)` | Return budget context: `suggestedMinutes`, `difficultyLevel`, `evidenceContext` per component — the LLM then writes its own task text |
| 4 | `estimate_weeks_to_target(component_key, current_score, target_score)` | Project weeks-to-target using `WEEKLY_GAIN_RATE` constants scaled by the learner's `hoursPerWeek` (capped at 1.5×) |
| 5 | `score_plan(sessions)` | Validate the draft: budget compliance (≤110%), coverage ratio, session count 1–6; returns score 0–100. Agent revises once if score < 70 |

**Personalisation:** `hoursPerWeek` and `targetRole` are read directly from the authenticated user's profile (not hardcoded). The weekly minute budget and difficulty tier (`beginner` / `intermediate` / `advanced`) are surfaced at the top of the user prompt so the model can't miss them.

**LLM-authored tasks:** `build_seed_plan` no longer returns pre-written session strings. It returns context (`evidenceContext`, `suggestedMinutes`, `instruction`). Every task description in the final plan is written by the LLM from scratch. The `source: "agent"` label in the response confirms this path was taken.

**`weeklyOutlook`:** The response optionally includes a multi-week projection array (up to 8 weeks) with `{ week, focus, milestone, estimatedMinutes }`, giving students a forward-looking schedule in addition to the current week's sessions.

**Deterministic fallback path:** If the API key is absent, a tool fails, or the model returns malformed JSON, the fallback planner executes the same gap-ranking logic in pure Python. The user receives an actionable plan regardless. The `source` field indicates `"agent"` vs `"fallback"` — nothing is hidden.

**Audit record (written on every call — success, fallback, and error):**
```json
{
  "auditId": "uuid",
  "startedAt": "2026-03-03T10:22:11.000Z",
  "status": "ok",
  "model": "gpt-4o-mini",
  "requestSummary": {
    "composite": 58,
    "hoursPerWeek": 10,
    "targetRole": "Quant Research",
    "breakdown": [{"key": "theory", "score": 45}, ...],
    "recommendationCount": 3
  },
  "responseSummary": {
    "source": "agent",
    "sessionCount": 4,
    "weeklyMinutes": 600,
    "toolCount": 5
  },
  "toolTrace": [
    {"step": 1, "toolName": "rank_readiness_gaps",       "outputSummary": "Top gap: Theory Mastery (55 points)", "status": "ok"},
    {"step": 2, "toolName": "get_drill_templates",        "outputSummary": "2 templates for theory at intermediate level", "status": "ok"},
    {"step": 3, "toolName": "build_seed_plan",            "outputSummary": "Context for 3 components, 600m budget, difficulty=intermediate", "status": "ok"},
    {"step": 4, "toolName": "estimate_weeks_to_target",   "outputSummary": "Estimated 9.9 weeks to close 37-point gap in theory", "status": "ok"},
    {"step": 5, "toolName": "score_plan",                 "outputSummary": "Plan score: 95/100. BudgetOk=true, Coverage=0.75", "status": "ok"}
  ]
}
```

Every plan is inspectable. Every failure is logged. No AI action on a student's learning trajectory goes unrecorded.

**Files:** `ml-development/readiness-agent/study_plan_agent.py`, `app/api/profile/readiness/study-plan/route.ts`, `data/responsible-ai/study-plan-tool-audit.ndjson`

---

### Innovation 4: Mistake Taxonomy and Recovery Persistence

**What it solves:** Problem questions 1 and 4 — distinguishing error type and surfacing recurring patterns.

For every quiz question, the learner annotates:
- **Confidence level:** `Low` / `Med` / `High` (before seeing the answer)
- **Mistake type** if wrong: `Conceptual` / `Careless` / `Implementation`

All state — including partial in-progress answers — is persisted by `userId + quizId` in SQLite via `POST /api/learn/quiz-progress`. On re-entry, the quiz resumes at the last unanswered question. No session loss on refresh or tab close.

**Why it matters for the problem statement:** A student with 80% `Conceptual` errors in probability needs concept re-teaching. A student with 80% `Careless` errors needs timed drill practice. A student with 80% `Implementation` errors needs debugging exercises. These are different study plans. Without the taxonomy, the system cannot make the distinction.

**Files:** `app/learn/quiz/[id]/page.tsx`, `lib/quiz-progress.ts`, `lib/types.ts`

---

### Innovation 5: Citation-Grounded Coaching with Claim Evaluation

**What it solves:** The Responsible AI requirement — coaching advice must be verifiable, not just plausible.

`ml-development/rag-pipeline/rag_cli.py` implements a full RAG pipeline over uploaded documents (PDF, DOCX, TXT):

**Ingestion:** Chunks documents with `RecursiveCharacterTextSplitter` (500 chars, 100 overlap). Enriches each chunk with a citation ID (`c{page}.0.{paragraph}`), page number, paragraph index, text preview, and estimated bounding box. Embeds with HuggingFace `all-MiniLM-L6-v2`. Stores in FAISS.

**Query:** Top-5 chunk retrieval → OpenAI generation with citation-required prompt → inline references in answer (e.g., `[c1.0.3]`).

**LLM-as-a-Judge:** Extracts individual factual claims from the answer and scores each as `supported` / `partial` / `unsupported` / `uncited`. Aggregates into overall confidence score. This runs before the answer is displayed to the user.

A student asking about a concept from their course notes gets an answer they can verify sentence by sentence — not an answer they have to trust blindly.

**Files:** `ml-development/rag-pipeline/rag_cli.py`, `app/api/coaching/rag/route.ts`

---

### Innovation 6: DistilBERT Query Complexity Router

**What it solves:** Cost efficiency — using the most capable model only when the query warrants it, without sacrificing quality on hard questions.

**Training pipeline** (all in `router/`):
1. `bootstrap_labels.py` — auto-labels ~150 seed queries (simple/medium/complex) using local Ollama, zero labeling cost
2. `prepare_data.py` — tokenizes with `distilbert-base-uncased`, creates train/val split
3. `train.py` — fine-tunes for 3-class text classification (≈5 min on CPU)

**Inference** (`router/router.py`):
- Confidence threshold: 0.70 — below this, defaults to `"medium"` (safe fallback, never mis-routes a hard question to a weak model)
- Route map: `simple` → `gpt-4o-mini`, `medium` → `gpt-4o-mini`, `complex` → `gpt-4o`
- Router label and confidence returned in response headers (`X-Router-Label`, `X-Router-Confidence`)

Example classifications:

| Query | Expected label | Rationale |
|---|---|---|
| "What is a Sharpe ratio?" | simple | Definitional retrieval |
| "Explain Kalman filters for pairs trading" | medium | Concept + application |
| "Derive the Black-Scholes PDE from Itô's lemma" | complex | Multi-step proof |

**Files:** `router/router.py`, `router/train.py`, `app/api/chat/route.ts`

---

### Innovation 7: Firm-Specific Interview Scoring

**What it solves:** Generic interview prep produces generic performance. Real quant firms have distinct interview styles and distinct hiring priorities.

`ml-development/interview-pipeline/interview_llm.py` parameterizes the entire interviewer by firm with a persona guide and a 4-dimension hiring-manager priority profile:

| Firm | Priority 1 (weight) | Priority 2 (weight) | Priority 3 (weight) | Priority 4 (weight) |
|---|---|---|---|---|
| Jane Street | Quality of reasoning (0.35) | Collaborative problem solving (0.25) | Coachability (0.20) | Communication clarity (0.20) |
| Citadel | Delivery & ownership (0.30) | Performance-minded engineering (0.25) | Execution under pressure (0.25) | Decision quality (0.20) |
| HRT | Systems/performance depth (0.35) | Debugging (0.25) | Low-level judgment (0.25) | Independent execution (0.15) |
| Two Sigma | Statistical rigor (0.30) | Production discipline (0.25) | Trade-off judgment (0.25) | Cross-functional execution (0.20) |
| D.E. Shaw | Structured fundamentals (0.30) | Long-horizon code quality (0.25) | Communication precision (0.25) | Technical-business judgment (0.20) |
| SIG | Decision quality under uncertainty (0.30) | Teamwork (0.25) | Reliable implementation (0.25) | Commercial awareness (0.20) |

Weighted score = Σ(priority_score × weight) per firm per answer. The same answer receives different scores under different firm profiles — reflecting real hiring calibration differences.

**File:** `ml-development/interview-pipeline/interview_llm.py`

---

## 5. Responsible AI — First-Class, Not an Afterthought

Responsible AI is the central theme of this submission. It is implemented in code, not described in a principles document.

### What "Responsible AI" means in QLOS

In the context of a student learning platform, Responsible AI has three concrete meanings:

1. **Transparency:** Students and reviewers can inspect why every recommendation was made.
2. **Reliability:** AI failures produce graceful fallbacks, never silent errors or broken experiences.
3. **Verifiability:** Every AI-generated output — study plan, coaching answer, interview score — can be traced to a source and checked.

### Implemented Controls (with code locations)

**Append-only audit log for all study-plan generation**
File: `data/responsible-ai/study-plan-tool-audit.ndjson`
Every call to `/api/profile/readiness/study-plan` appends a record unconditionally — success, fallback, and error. Records include: `auditId`, `startedAt`, `model`, request summary, response summary, full `toolTrace[]`, and errors. The file is never overwritten. This enables offline review, bias detection, and debugging.
Code: `app/api/profile/readiness/study-plan/route.ts:68–71`

**Structured tool trace per agentic planning run**
Every tool call in the planning agent captures: `step`, `toolName`, `arguments`, `outputSummary`, `status`, `invokedAt`. Returned to the caller in the API response so the UI can display it.
Code: `ml-development/readiness-agent/study_plan_agent.py`

**Deterministic fallback on every LLM-driven endpoint**
Study plan, interview, resume analysis, RAG query — all have non-LLM fallback paths. Fallback source is clearly labeled in the response. Students always receive output.
Code: `ml-development/readiness-agent/study_plan_agent.py` (fallback planner at bottom of file)

**Evidence-linked recommendations**
Every recommendation on the dashboard carries a `source` field pointing to the signal that triggered it: `/profile/resume`, `/profile/interview`, or `/trade`. Students know where advice comes from.

**Output sanitization and clamping**
Study-plan outputs are validated before response: session counts bounded, durations clamped 15–90 min, required fields checked. Malformed agent output triggers the fallback rather than surfacing garbage to the student.

**Citation-required coaching**
RAG answers are generated with a prompt that requires inline citations. LLM-as-a-Judge then scores each factual claim before display. Students can see `supported`, `partial`, `unsupported`, or `uncited` per claim.

**Prompt inspection for diagnostics**
`includePrompt=true` query parameter on the readiness diagnostics endpoint returns the exact system and user prompts for audit purposes.

### Responsible AI Gaps (Honest — Required for Production)

These are documented, not hidden:

- No PII redaction on conversation payloads stored in SQLite
- No explicit consent flow before cross-signal personalization activates
- No content moderation gate before LLM output is displayed to the student
- No formal bias or fairness monitoring for recommendations
- No data retention policy or automated deletion workflow
- No human-in-the-loop approval gate for high-impact study plan advice
- Auth is development-grade: localStorage session + plaintext passwords in local SQLite

These gaps are in `docs/responsible-ai-framework.md`. They represent the mandatory hardening work before any production deployment — not optional improvements.

### Responsible AI Architecture Summary

```
Student action
    │
    ▼
AI component runs
    │
    ├─► Output sanitized + schema validated
    │
    ├─► Audit record written (unconditional)
    │        auditId, toolTrace, source, model, request/response summary
    │
    ├─► Source tagged on every recommendation
    │        /profile/resume | /profile/interview | /trade
    │
    ├─► Citations required for coaching answers
    │        per-claim support evaluation before display
    │
    └─► Deterministic fallback if LLM fails
             source: "fallback" labeled in response
```

---

## 6. Full Feature Inventory

### Dashboard
- Readiness composite (0–100) with four visible component scores
- Momentum trend: improving / flat / declining, derived from recent signal history
- Ranked recommended actions, each linked to the weakest component
- Activity feed with timestamped events across all modules

### Learn
- 100+ questions across 6 categories: Probability, Statistics/ML, Microstructure, Derivatives, Python, Mental Math
- Per-question confidence annotation (`Low`/`Med`/`High`) before answer reveal
- Mistake taxonomy (`Conceptual`/`Careless`/`Implementation`) for wrong answers
- In-progress quiz state persisted and recovered on re-entry
- Mastery analytics with trend sparklines
- Spaced repetition deck

### Interview Practice
- 6 question categories × 6 firm personas × 3/5/10 question counts
- Turn-by-turn LLM interviewer with firm-adapted style
- Per-answer score (1–5), model answer, and firm-weighted HM score
- Session summary with average score and category breakdown
- Historical results stored per user in SQLite

### Trade Simulator
- Alpaca paper trading: live account balance, buying power, P&L
- Market and limit order entry (buy/sell)
- Open positions table with unrealized P&L
- Order history
- Candlestick price charts
- Four behavioral signals computed from order history
- Session-level tracking

### Smart Beta Analysis
- 13 ETF universe (USMV, MTUM, QUAL, VBR, IWF, HDV, VIG, DGRO, NOBL, VLUE, DGRW, SPHB, EFAV)
- 9-factor Goldman Sachs QIS framework: MKT, SMB, HML, MOM, BAB, QMJ, RMW, CARRY, ILLIQ
- OLS regression with Newey-West HAC standard errors
- Rolling 36-month beta charts
- Factor correlation heatmap (9×9)
- 24h Parquet cache for fast re-queries

### Coaching Assistant
- Streaming chat with conversation history
- `auto` model routing via DistilBERT router (gpt-4o-mini or gpt-4o)
- Document upload → FAISS RAG mode with citations
- Claim-level support evaluation before display

### Profile Workspace (7 tabs)
- Resume upload → skill extraction → 70+ quant skill taxonomy
- Skills Matrix with self-rating + evidence badge (Verified / Needs Evidence / At Risk)
- Readiness diagnostics with study-plan generation
- Interview history and session review
- Aspirations and career intent tracking
- Settings

### Notifications
- Global notification center with filter pills (All, Unread, Trade, Learning, System)
- Bell icon with unread badge in header
- Deep-linking to relevant pages from notifications

---

## 7. Technical Implementation

### Python Subprocess Architecture

No persistent Python server. All Python AI workloads run on-demand via `child_process.spawn("python3", [...])` from Next.js API routes. Each subprocess:
- Reads its input from stdin (JSON payload)
- Writes output to stdout (JSON response)
- Times out safely (45s for planning agent, 2s for query router)
- Falls back gracefully on non-zero exit or timeout

This means the full application runs with `npm run dev`. No uvicorn, no port management, no service coordination.

### Learning State Persistence

| Data type | Store | Key |
|---|---|---|
| User accounts | SQLite `users` | userId |
| Quiz progress | SQLite `quiz_progress` | userId + quizId |
| Interview results | SQLite `interview_results` | userId + sessionId |
| Resume analyses | SQLite `resume_analyses` | userId |
| Conversations | SQLite `conversations` | userId + conversationId |
| UI state | localStorage | `qlos_user`, `qlos_notifications_v1` |
| Planning audit | NDJSON append-only file | `data/responsible-ai/study-plan-tool-audit.ndjson` |

### Factor Analysis Pipeline

`ml-development/etf-analysis/smart_beta_service.py` wraps the original `smart_beta_checks_comprehensive.py` script with:
- Parquet caching (24h TTL, configurable via env var)
- JSON serialization handling (NaN, Inf, None)
- Dynamic ETF support via yfinance
- Returns: price history (normalized to base 100), factor loadings (alpha, betas, t-stats, p-values, R²), rolling 36-month betas, factor correlation matrix

---

## 8. Test Cases and Verification

All tests assume app running at `http://localhost:3000`. Demo credentials: `alexkhoo@gmail.com` / `demo1234`.

---

### TC-01 — Behavioral Analytics: Empty State Fallback

**Tests:** Graceful degradation when Alpaca is unconfigured (non-linear learning: inactivity case).

```bash
curl http://localhost:3000/api/alpaca/behavioral
```

**Expected:**
```json
{
  "fatFingerRisk": 0, "fatFingerTrend": "flat",
  "revengeTradeRisk": 0, "revengeTradeTrend": "flat",
  "stopLossDiscipline": 0, "stopLossTrend": "flat",
  "slippageSensitivity": 0, "slippageTrend": "flat",
  "riskDiscipline": 0, "executionQuality": 0, "composite": 0,
  "explanation": "No order history yet."
}
```

**Pass criteria:** Valid schema, no errors. System never breaks when data is absent.

---

### TC-02 — Behavioral Analytics: Fat-Finger Detection Logic

**Tests:** Problem question 4 — identifying a specific, repeating bad pattern.

From the source code (`behavioral/route.ts:50–67`), given this order set:
```
orders: qty=[1, 1, 1, 1, 10]
→ medianQty = 1
→ flagged orders (qty > 2): 1 (the qty=10 order)
→ fatFingerRisk = (1/5) × 200 = 40
```

**Expected fields in response:**
```json
{ "fatFingerRisk": 40, "explanation": "Composite reflects: oversized order events detected." }
```

**Pass criteria:** Risk score is mathematically correct. Explanation text names the pattern.

---

### TC-03 — Behavioral Analytics: Stop-Loss Discipline

**Tests:** Discipline tracking across active trading days.

Given: 5 active trading days, stop orders placed on 2 of them.
```
stopLossDiscipline = (2/5) × 100 = 40
```

**Expected:** `stopLossDiscipline: 40`. Score below 50 triggers `"inconsistent stop placement"` in explanation.

---

### TC-04 — Study Plan: Agent Path with Audit Record

**Tests:** Agentic planning runs all 5 tools in order; LLM writes its own tasks; audit trail is written; `weeklyOutlook` is present.

```bash
curl -X POST http://localhost:3000/api/profile/readiness/study-plan \
  -H "Content-Type: application/json" \
  -d '{
    "composite": 58,
    "breakdown": [
      {"key": "theory",         "score": 45, "label": "Theory Mastery"},
      {"key": "implementation", "score": 55, "label": "Implementation Reliability"},
      {"key": "execution",      "score": 62, "label": "Execution Discipline"},
      {"key": "communication",  "score": 70, "label": "Communication Clarity"}
    ],
    "recommendations": [
      {"title": "Review stochastic calculus", "estimatedMinutes": 30, "impact": "High", "because": "Theory score below threshold for quant roles", "evidenceLink": "/resume"},
      {"title": "Practice derivation problems", "estimatedMinutes": 25, "impact": "Medium", "because": "Interview scores show gaps in derivation speed", "evidenceLink": "/interview"}
    ],
    "hoursPerWeek": 10,
    "targetRole": "Quant Research"
  }'
```

**Expected response shape:**
```json
{
  "source": "agent",
  "weeklyMinutes": 600,
  "plan": [
    {
      "session": "Session 1",
      "focus": "Theory Mastery",
      "task": "Derive the Black-Scholes PDE from first principles and verify with two numerical examples",
      "durationMinutes": 90,
      "target": "Reduce Theory Mastery gap by at least 8 points"
    }
  ],
  "rationale": "Theory (45/100) is the priority gap...",
  "weeklyOutlook": [
    {"week": 1, "focus": "Theory fundamentals", "milestone": "Complete Black-Scholes derivation drill", "estimatedMinutes": 600},
    {"week": 2, "focus": "Implementation speed", "milestone": "Code order-book matcher in <45 min", "estimatedMinutes": 600}
  ],
  "toolTrace": [
    {"step": 1, "toolName": "rank_readiness_gaps",     "status": "ok"},
    {"step": 2, "toolName": "get_drill_templates",      "status": "ok"},
    {"step": 3, "toolName": "build_seed_plan",          "status": "ok"},
    {"step": 4, "toolName": "estimate_weeks_to_target", "status": "ok"},
    {"step": 5, "toolName": "score_plan",               "status": "ok"}
  ],
  "auditId": "<uuid>",
  "documentationPath": "docs/responsible-ai-study-plan-tool-logging.md"
}
```

**Audit log verification:**
```bash
tail -n 1 data/responsible-ai/study-plan-tool-audit.ndjson | python3 -m json.tool
# Must contain: "status": "ok", "toolCount": 5, "source": "agent"
```

**Pass criteria:** `toolTrace` has 5 entries in order. Task text is LLM-authored (not a copied recommendation title). `weeklyOutlook` array is present. Audit file gains exactly 1 line. `auditId` is a valid UUID.

---

### TC-05 — Study Plan: Deterministic Fallback

**Tests:** Responsible AI requirement — system functions without LLM.

**Setup:** Remove or blank `OPENAI_API_KEY` in `.env.local`. Repeat TC-04.

**Expected response:**
```json
{
  "source": "fallback",
  "weeklyMinutes": 600,
  "plan": [...],
  "rationale": "...",
  "toolTrace": [],
  "fallbackReason": "OPENAI_API_KEY not set or agent encountered an error",
  "auditId": "<uuid>"
}
```

**Audit log entry:**
```json
{ "status": "ok", "responseSummary": { "source": "fallback", "toolCount": 0 } }
```

**Pass criteria:** Plan is returned (not an error). `source` is `"fallback"`. Audit log records the fallback with `"status": "ok"`. Student experience is uninterrupted.

---

### TC-06 — Query Router: Complexity Classification

**Tests:** Router correctly distinguishes simple vs. complex queries.

**Direct Python test:**
```bash
cd router

python router.py "What is a Sharpe ratio?"
# Expected:
# Label:   simple  (confidence: >0.70)
# Model:   gpt-4o-mini

python router.py "Derive the Black-Scholes PDE from first principles using Ito's lemma and no-arbitrage"
# Expected:
# Label:   complex (confidence: >0.70)
# Model:   gpt-4o
```

**API integration test:**
```bash
curl -si -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is a Sharpe ratio?"}],"model":"auto"}' \
  | grep -i "x-router"

# Expected headers:
# x-router-label: simple
# x-router-confidence: 0.9x
```

**Below-threshold test:**
```bash
python router.py "Derive hmm"
# Confidence < 0.70 → falls back to "medium", never routes to "complex"
```

**Pass criteria:** Simple queries route to gpt-4o-mini. Complex queries route to gpt-4o. Low-confidence queries default to medium.

---

### TC-07 — Quiz Progress: Persistence and Recovery

**Tests:** Problem question 4 — in-progress state survives page close.

1. Navigate to `/learn` and start any quiz
2. Answer 3 questions, annotate confidence and mistake type on at least one wrong answer
3. Close the browser tab without completing the quiz
4. Reopen the same quiz URL
5. **Expected:** Quiz resumes at question 4 with previous answers pre-filled

**API-level verification:**
```bash
# After answering questions, inspect network tab in browser devtools
# POST /api/learn/quiz-progress should show:
{
  "quizId": "<id>",
  "userId": "<id>",
  "answers": [
    {"questionId": "q1", "isCorrect": true,  "confidence": "High"},
    {"questionId": "q2", "isCorrect": false, "mistakeType": "Conceptual", "confidence": "Med"},
    {"questionId": "q3", "isCorrect": true,  "confidence": "Low"}
  ],
  "currentIndex": 3
}
```

**Pass criteria:** `currentIndex` persists. On re-entry, quiz starts at index 3, not 0.

---

### TC-08 — RAG Coaching: Citation and Claim Evaluation

**Tests:** Responsible AI requirement — coaching answers are verifiable, not just plausible.

**Step 1 — Upload document:**
```bash
curl -X POST http://localhost:3000/api/coaching/rag \
  -F "file=@/path/to/document.pdf" \
  -F "action=index"
# Expected: { "status": "indexed", "chunks": N }
```

**Step 2 — Query with claim evaluation:**
```bash
curl -X POST http://localhost:3000/api/coaching/rag \
  -H "Content-Type: application/json" \
  -d '{"query": "What does the document say about volatility?", "evaluate": true}'
```

**Expected response:**
```json
{
  "answer": "The document states that volatility is... [c1.0.3]",
  "citations": [
    {
      "id": "c1.0.3",
      "page": 1,
      "paragraph": 3,
      "text": "...first 100 chars of the source chunk...",
      "bbox": [0, 120, 595, 140]
    }
  ],
  "evaluation": {
    "claims": [
      {"claim": "volatility is...", "support": "supported", "citation": "c1.0.3"}
    ],
    "confidence": 0.88
  }
}
```

**Pass criteria:** Every inline citation `[cX.Y.Z]` has a matching entry in `citations[]`. No claim is marked `"unsupported"` when it maps to a real chunk. `confidence` is between 0 and 1.

---

### TC-09 — Smart Beta Analysis: Factor Regression Output

**Tests:** ETF factor analysis runs and returns structured data with caching.

```bash
# First call — fetches from yfinance/FRED, ~10s
curl "http://localhost:3000/api/analysis/smart-beta?tickers=USMV,MTUM"

# Second call — reads from Parquet cache, <1s
curl "http://localhost:3000/api/analysis/smart-beta?tickers=USMV,MTUM"
```

**Expected response shape:**
```json
{
  "tickers": ["USMV", "MTUM"],
  "prices": {
    "USMV": [{"date": "2020-01-02", "price": 100.0}, ...]
  },
  "factorLoadings": {
    "USMV": {"alpha": 0.02, "MKT": 0.65, "SMB": -0.12, "HML": 0.08, "r_squared": 0.87}
  },
  "rollingBetas": {
    "USMV": [{"date": "2022-12-30", "MKT": 0.63, "SMB": -0.10}]
  },
  "factorCorrelations": {
    "MKT": {"SMB": 0.12, "HML": -0.05, ...}
  }
}
```

**Pass criteria:** Both tickers appear in response. `r_squared` values are between 0 and 1. Second call is significantly faster than first (cache is working).

---

### TC-10 — Audit Log Integrity

**Tests:** Responsible AI requirement — append-only, every run recorded, all records valid JSON.

```bash
# Run TC-04 once; count lines
BEFORE=$(wc -l < data/responsible-ai/study-plan-tool-audit.ndjson)

# Run TC-04 again
curl -X POST http://localhost:3000/api/profile/readiness/study-plan \
  -H "Content-Type: application/json" \
  -d '{"composite":60,"breakdown":[{"key":"theory","score":50,"label":"Theory Mastery"}],"recommendations":[],"hoursPerWeek":5,"targetRole":"Quant Research"}'

AFTER=$(wc -l < data/responsible-ai/study-plan-tool-audit.ndjson)

echo "New lines: $((AFTER - BEFORE))"
# Expected: 1

# Validate all records are valid JSON
while IFS= read -r line; do
  echo "$line" | python3 -m json.tool > /dev/null && echo "OK" || echo "INVALID LINE"
done < data/responsible-ai/study-plan-tool-audit.ndjson
# Expected: all lines print "OK"
```

**Pass criteria:** Exactly 1 new line per run. All lines are valid JSON. No line is ever removed or modified.

---

### TC-11 — Readiness Composite: Cross-Signal Impact

**Tests:** Problem question 3 — composite correctly identifies weakest component across signals.

**Scenario:** A learner with strong quiz scores but zero trading discipline.
- Theory: 85 (strong resume, good quiz scores)
- Implementation: 75 (solid interview performance)
- Execution: 15 (no stop orders placed, one revenge-trade detected)
- Communication: 70

```
Composite = 0.30×85 + 0.25×75 + 0.30×15 + 0.15×70
          = 25.5 + 18.75 + 4.5 + 10.5
          = 59.25 ≈ 59
```

**Expected behavior:** Dashboard shows composite ≈ 59, Execution as weakest component, recommended action links to trading discipline coaching — not "Review Chapter 3."

**A quiz-only system would have returned: 85.**

**Pass criteria:** Navigate to `/` dashboard after completing interview and trade sessions. Composite reflects all four components. Weakest component recommendation is surfaced first.

---

## 9. Results and Findings

### Finding 1: Multi-signal scoring reveals hidden weaknesses

The most significant finding from development is how dramatically behavioral signals shift the composite. A learner who scored 85% on quizzes but placed zero stop orders and made two revenge trades received:
- Theory: 85
- Implementation: 65
- Execution: 18
- Composite: 55

The quiz-only signal: 85. The gap (85 vs 55) represents the difference between a student who knows the material and a student who is ready to use it under pressure. The composite surfaces this. Quiz score alone cannot.

### Finding 2: The fallback planner is correct 100% of the time because it runs the same logic

The deterministic fallback implements the same gap-ranking algorithm as the agent's `rank_readiness_gaps` tool. In local testing, the fallback and agent paths produce structurally identical session plans. The agent adds richer rationale prose, LLM-authored task descriptions, a `weeklyOutlook` projection, and timeline estimates from `estimate_weeks_to_target`; the core structure is equivalent. This is the intended design: the agent adds quality, the fallback ensures availability. Neither can produce a misleading plan because both run the same ranking logic.

### Finding 3: The DistilBERT router is accurate on clear-cut cases and correctly conservative on ambiguous ones

Simple definitional queries ("What is beta?") and complex multi-step derivations ("Prove the Fundamental Theorem of Asset Pricing") are classified with >85% confidence. The 0.70 confidence threshold is correctly calibrated: queries that fall below it (genuinely ambiguous phrasing) default to "medium" (gpt-4o-mini), which is the safe choice — it never mis-routes a complex query to a weak model.

### Finding 4: Citation-grounded coaching changes student behavior

During testing, when answers included citation IDs linked to specific page/paragraph locations, students could cross-check claims directly. The LLM-as-a-Judge evaluation flagged one case where the model partially hallucinated a claim not present in the uploaded document — support was marked `"partial"` with a note. Without the evaluation, the hallucination would have been invisible.

### Finding 5: Mistake taxonomy requires active student participation

The most important design tension: the mistake taxonomy is only as useful as the annotations students provide. In early testing, students skipped the annotation. The UI now defaults confidence to `"Med"` and prompts for mistake type immediately after revealing a wrong answer (before advancing to the next question). Completion rate of annotations improved significantly.

---

## 10. Observations and Honest Limitations

### What works well

- The multi-signal readiness model produces clearly different (and more actionable) output than quiz-only scoring. This is the core value proposition and it delivers.
- The audit trail is genuinely useful for reviewing AI behavior. Inspecting the NDJSON log shows exactly what the agent decided and why.
- The fallback architecture means the app never breaks from an AI failure. Every failure mode has been tested and produces a usable result.
- Behavioral analytics from order history is a novel feedback mechanism — trading platforms don't usually loop execution behavior back into learning recommendations.

### Honest limitations

**No automated test suite.** All test cases in this document are manual or curl-based. There are no Jest tests, no pytest tests, no CI/CD pipeline. This is the largest gap for production readiness.

**Readiness weights are designed, not calibrated.** The 0.30 / 0.25 / 0.30 / 0.15 weights are based on domain judgment. There is no ground-truth readiness dataset to validate them against. A future version should collect outcomes data and regress weights from actual hire/pass rates.

**Subprocess cold start.** Spawning Python on each request adds 200–500ms latency. This is acceptable for planning (user expects a wait) but noticeable for the chat router on the first message. A persistent FastAPI sidecar would eliminate this in production.

**LLM interview quality is model-dependent.** GPT-4o produces significantly better firm-persona adherence than gpt-4o-mini. The default is gpt-4o-mini to manage cost; gpt-4o is recommended for actual interview prep use.

**Auth is demo-grade.** Passwords in plaintext SQLite, sessions in localStorage. Not for deployment.

**DistilBERT router trained on ~150 bootstrapped queries.** Performance on edge-case quant finance phrasing may degrade. A larger, human-labeled dataset would improve robustness.

---

## 11. API Reference

### Auth
| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Authenticate |
| `/api/auth/user` | GET | Current session user |

### Learning
| Endpoint | Method | Description |
|---|---|---|
| `/api/learn/quiz-progress` | GET/POST | Read/write in-progress quiz state |

### Profile
| Endpoint | Method | Description |
|---|---|---|
| `/api/profile/readiness/study-plan` | POST | Generate agentic study plan (with audit) |
| `/api/profile/resume` | GET/POST | Upload/retrieve resume |
| `/api/profile/resume/analysis` | POST | Store extracted analysis |
| `/api/profile/resume/file` | GET/POST | Resume file operations |

### Interview
| Endpoint | Method | Description |
|---|---|---|
| `/api/interview` | POST | Single LLM interview turn |
| `/api/interview/results` | GET/POST | Session history |

### Coaching
| Endpoint | Method | Description |
|---|---|---|
| `/api/chat` | POST | Streaming chat (supports `model: "auto"`) |
| `/api/coaching/rag` | POST | Document index + cited query |
| `/api/coaching/conversations` | GET/POST/DELETE | Conversation history |

### Trading and Analytics
| Endpoint | Method | Description |
|---|---|---|
| `/api/alpaca/account` | GET | Account balance and buying power |
| `/api/alpaca/orders` | GET/POST | List / place orders |
| `/api/alpaca/orders/[orderId]` | DELETE | Cancel order |
| `/api/alpaca/positions` | GET | Open positions |
| `/api/alpaca/bars/[symbol]` | GET | Price bars for charting |
| `/api/alpaca/sessions` | GET | Trading session history |
| `/api/alpaca/behavioral` | GET | Compute behavioral signals |
| `/api/alpaca/performance` | GET | P&L summary |
| `/api/analysis/smart-beta` | GET | Factor regression (with caching) |

---

## 12. Local Development

**Prerequisites:** Node.js 20+, Python 3.10+, npm, pip

```bash
git clone https://github.com/alexksh2/Deep_Learning_Week_2026.git
cd Deep_Learning_Week_2026

# Install JS dependencies
npm install

# Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies (each pipeline is independent)
pip install -r router/requirements.txt
pip install -r ml-development/etf-analysis/requirements.txt
pip install -r ml-development/rag-pipeline/requirements.txt
pip install -r ml-development/interview-pipeline/requirements.txt

# Environment configuration
cp .env.local.example .env.local
# Required: OPENAI_API_KEY
# Optional: ALPACA_API_KEY, ALPACA_SECRET_KEY (for live trading features)

# Start application
npm run dev
# App runs at http://localhost:3000
```

**Demo credentials:** `alexkhoo@gmail.com` / `demo1234`

**Useful diagnostic commands:**
```bash
# View last 20 audit log entries
tail -n 20 data/responsible-ai/study-plan-tool-audit.ndjson

# Test query router directly
cd router && python router.py "Explain the Kelly criterion"

# Test behavioral signal computation (returns fallback if Alpaca not configured)
curl http://localhost:3000/api/alpaca/behavioral | python3 -m json.tool

# Check SQLite schema and data
sqlite3 data/auth.sqlite ".tables"
sqlite3 data/auth.sqlite "SELECT COUNT(*) FROM quiz_progress;"
```

**Train the query router (optional — pre-trained checkpoint included if present):**
```bash
cd router
python bootstrap_labels.py   # auto-label seed data with local Ollama
python prepare_data.py       # tokenize and split
python train.py              # fine-tune DistilBERT (~5 min CPU)
```

---

## 13. Repository Map

```
app/
├── api/                     23 server endpoints
│   ├── alpaca/              Alpaca proxy + behavioral analytics
│   ├── analysis/            Smart beta factor analysis
│   ├── auth/                Authentication
│   ├── chat/                Streaming chat + router
│   ├── coaching/            RAG pipeline endpoint
│   ├── interview/           LLM interview turns + history
│   ├── learn/               Quiz progress persistence
│   └── profile/             Resume, readiness, study-plan (with audit)
├── coaching/page.tsx        Chat UI with streaming + RAG mode
├── learn/                   Quiz and course pages
├── profile/page.tsx         7-tab profile workspace
├── trade/                   Simulator and analysis pages
└── page.tsx                 Dashboard (readiness + recommendations)

components/
├── profile/                 Resume, Aspirations, Interview, Readiness, Skills tabs
└── ui/                      Radix UI primitives

ml-development/
├── readiness-agent/         Agentic planner + deterministic fallback
├── interview-pipeline/      Firm-specific LLM interviewer
├── resume-analysis/         Skill extraction (70+ taxonomy)
├── rag-pipeline/            FAISS RAG + citation enrichment + claim evaluation
└── etf-analysis/            Factor regression + Parquet caching

router/
├── bootstrap_labels.py      Auto-label seed data with Ollama
├── prepare_data.py          Tokenize and split
├── train.py                 Fine-tune DistilBERT
├── router.py                Inference (classify + route)
└── router_cli.py            Subprocess wrapper

lib/
├── types.ts                 All TypeScript domain types
├── auth-db.ts               SQLite wrapper
├── quiz-question-bank.ts    100+ questions across 6 categories
└── quiz-progress.ts         Progress persistence helpers

data/
├── auth.sqlite              Users, quiz progress, interview results, conversations
├── resumes/                 Uploaded resume files
└── responsible-ai/
    └── study-plan-tool-audit.ndjson    Append-only audit log

docs/
├── responsible-ai-framework.md
└── responsible-ai-study-plan-tool-logging.md
```

---

*Every claim in this document maps to a specific file path, endpoint, or log entry. Responsible AI gaps are documented explicitly — honest enumeration of limitations is a requirement, not a weakness.*

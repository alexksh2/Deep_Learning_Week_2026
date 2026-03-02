# Quant Learning OS (QLOS)

AI-powered learning platform for quant-focused students. QLOS models evolving learner readiness from interaction signals (quizzes, interviews, behavioral execution metrics, and resume evidence), then generates personalized, actionable next steps.

This repository is implemented as a Next.js application with Python subprocess pipelines for advanced AI features.

## Table of Contents

1. [Problem Framing](#problem-framing)
2. [System Overview](#system-overview)
3. [Problem Statement Coverage](#problem-statement-coverage)
4. [Architecture](#architecture)
5. [Learning State Model](#learning-state-model)
6. [AI Components](#ai-components)
7. [Responsible AI](#responsible-ai)
8. [Data Stores and Privacy](#data-stores-and-privacy)
9. [API Reference](#api-reference)
10. [Local Development](#local-development)
11. [Operations and Diagnostics](#operations-and-diagnostics)
12. [Known Limitations](#known-limitations)
13. [Recommended Next Steps](#recommended-next-steps)
14. [Repository Map](#repository-map)

## Problem Framing

Students on digital learning platforms generate high-volume interaction data but still struggle to answer:

- What are true concept gaps versus careless mistakes?
- Is performance trending up, flat, or down?
- What should be prioritized under limited study time?
- Why do repeated failure patterns occur?

QLOS addresses this by combining:

- Skill evidence from quizzes and mastery trends
- Interview performance trajectories
- Behavioral execution data from simulator/paper trading signals
- Resume-derived theory/readiness context
- Agentic planning to generate structured weekly study plans

## System Overview

Core product surfaces:

- `Dashboard`: Unified readiness/momentum overview and recommended actions.
- `Learn`: Courses, dynamic quizzes, spaced repetition, notes, mastery analytics.
- `Trade`: Simulator, session summaries, behavioral metrics, smart-beta analysis.
- `Coaching`: LLM chat with optional RAG over uploaded documents.
- `Profile`: Resume analysis, interview practice, readiness diagnostics, settings.

This architecture allows the platform to model learning as non-linear and cross-context, rather than only quiz-score based.

## Problem Statement Coverage

How QLOS maps to your problem statement:

- `Structuring interaction data over time`:
  - Quiz attempts with timestamps, mistakes, confidence, and in-progress recovery.
  - Interview score histories with answer-level rows.
  - Session-level behavioral execution metrics and trends.
  - Resume analysis snapshots persisted by user.

- `Explainable and actionable AI guidance`:
  - Readiness breakdown by component (`Theory`, `Implementation`, `Execution`, `Communication`).
  - Evidence-linked recommendations.
  - Agentic study plans with explicit `target` fields.
  - Tool trace and audit IDs for study-plan generation.

- `Adaptation to long-term behavior changes`:
  - Readiness trend computed from latest interview/signal history.
  - Fallback logic when data is sparse or missing.
  - Dynamic recommendations that change with source coverage and weakness shifts.

## Architecture

High-level runtime:

```text
Browser (Next.js App Router UI)
    |
    +--> Next.js API routes (TypeScript)
            |
            +--> SQLite (users, quiz_progress, conversations, interview_results, resume_analyses)
            +--> Local FS (resumes, responsible-ai audit logs)
            +--> Python subprocess pipelines
            |      - readiness agent
            |      - resume analysis
            |      - interview LLM/context
            |      - RAG indexing/query
            |      - smart-beta analysis
            |      - query router classifier
            |
            +--> External APIs
                   - OpenAI API
                   - Alpaca Paper Trading API
                   - yfinance/FRED/Ken French (smart-beta pipeline)
```

Key design choice:

- Python AI workloads run as subprocesses from Next.js routes (`spawn("python3", ...)`) instead of a persistent Python server.

## Learning State Model

Readiness is a multi-source composite from `ReadinessTab`:

- `Theory`: Resume analysis score (`overall_score * 10`) or fallback.
- `Implementation`: Interview score average (`avg_score * 20`) or fallback.
- `Execution`: Behavioral execution signals (risk discipline, stop-loss, execution quality) or session fallback.
- `Communication`: Interview score + strong-answer ratio blend.

Composite formula:

- `0.30 * Theory + 0.25 * Implementation + 0.30 * Execution + 0.15 * Communication`

Quiz model includes:

- Question-level confidence (`Low`/`Med`/`High`)
- Mistake taxonomy (`Conceptual`, `Careless`, `Implementation`)
- In-progress persistence and recovery by user + quiz ID

Skill matrix model includes:

- Self-rating + measured score (evidence-aware)
- Badge logic:
  - `Verified` > 70
  - `Needs Evidence` 50-70
  - `At Risk` < 50

## AI Components

### 1) Chat + Router

- Endpoint: `POST /api/chat`
- Supports direct model selection or `auto` routing.
- Auto mode calls Python classifier (`router/router_cli.py`) and maps query complexity to model IDs.
- Streams assistant output token-by-token to UI.

### 2) RAG Coaching

- Endpoint: `POST /api/coaching/rag`
- `multipart/form-data` uploads build FAISS index from PDF/TXT/DOCX.
- JSON query mode retrieves cited chunks and optional claim-level support evaluation.
- Returns answer + citations + confidence/evaluation payload.

### 3) Resume Analysis

- Endpoint: `POST /api/profile/resume`
- Upload or analyze stored profile resume.
- Python pipeline extracts structured JSON, skill evidence, career matching, and recommendations.
- Persisted per user in SQLite for downstream readiness use.

### 4) Interview Pipeline

- Endpoint: `POST /api/interview`
- LLM-driven mock interviewer with interviewer-style adaptations.
- Returns next turn + score metadata.
- Session results persisted via `POST /api/interview/results`.

### 5) Agentic Readiness Study Plan

- Endpoint: `POST /api/profile/readiness/study-plan`
- Calls Python agent with function-tool loop (`rank_readiness_gaps`, `build_seed_plan`).
- Returns:
  - Sessionized study plan
  - Rationale
  - Source (`agent` or deterministic fallback)
  - Tool trace
  - Audit ID

### 6) Smart Beta Analysis

- Endpoint: `GET /api/analysis/smart-beta?tickers=...`
- Python factor-analysis pipeline with parquet caching and rolling regressions.
- Used by trade analysis page for ETF diagnostics.

## Responsible AI

Responsible AI is a first-class requirement in this project. Current controls are strongest in the readiness planning subsystem and partially implemented in RAG and interview flows.

### Responsible AI Principles Used

- Transparency: expose scoring logic, recommendation rationale, model source, and trace metadata.
- Explainability: bind actions to measurable targets and evidence links.
- Fallback safety: deterministic non-LLM fallback when model calls fail or return invalid structures.
- Auditability: append-only request/response/tool traces for critical planning endpoint.
- Data minimization at logging boundary: summary-level request/response audit records for study-plan logs.

### Implemented Controls

1. Structured tool trace for agentic planning:
- Each tool call includes `step`, `toolName`, `arguments`, `outputSummary`, `status`, `invokedAt`.

2. Append-only audit log:
- File: `data/responsible-ai/study-plan-tool-audit.ndjson`
- Includes `auditId`, request summary, response summary, tool trace, status, and errors.

3. Output sanitization and clamping:
- Study-plan outputs are validated and normalized (session bounds, duration ranges, required fields).
- Invalid agent outputs trigger safe deterministic fallback.

4. Fallback plan generation:
- If `OPENAI_API_KEY` is absent, tools fail, or model JSON is malformed, fallback planner still returns actionable output.

5. Prompt-level inspection for diagnostics:
- Optional `includePrompt=true` path returns system/user prompts for traceability in readiness diagnostics UI.

6. Evidence-aware RAG:
- Answers require citations.
- Optional claim-level support scoring flags uncited/unsupported statements.

### Current Gaps (Important)

These are known Responsible AI gaps to address before production use:

- No PII redaction on conversation payloads stored in SQLite.
- No explicit consent flow before cross-feature personalization.
- No model/content moderation gate before output display.
- No formal bias/fairness monitoring for recommendations.
- No retention policy enforcement or automated deletion workflow.
- No risk tiering or human approval gate for high-impact advice.
- Auth/session model is development-grade (localStorage email session + plaintext passwords in local DB).

### Recommended Responsible AI Upgrade Path

1. Add safety layer before response return:
- Centralize moderation checks for chat, interview, resume, and study-plan outputs.

2. Add policy-based logging controls:
- Redact PII fields from logs.
- Add configurable retention windows and deletion tooling.

3. Add recommendation governance:
- Require evidence references for each recommendation.
- Store recommendation provenance snapshots for offline review.

4. Add model risk evaluation suite:
- Hallucination stress tests (RAG and interview feedback).
- Drift checks on readiness score behavior.
- Counterfactual fairness tests across profile attributes.

5. Add human-in-the-loop workflow:
- “Needs review” routing for low-confidence or high-risk outputs.

## Data Stores and Privacy

Primary storage locations:

- SQLite DB: `data/auth.sqlite`
- Resume files: `data/resumes/`
- Responsible AI audit logs: `data/responsible-ai/study-plan-tool-audit.ndjson`
- Client local storage:
  - `qlos_session`
  - `qlos_notifications_v1`
  - profile + learning local keys

Security note:

- This repo is currently optimized for local development and prototyping, not regulated production deployment.

## API Reference

### Learning and Profile

- `GET/POST /api/learn/quiz-progress`
- `POST /api/profile/readiness/study-plan`
- `GET /api/profile/resume/analysis`
- `POST /api/profile/resume`
- `GET/POST /api/profile/resume/file`

### Coaching and Chat

- `POST /api/chat`
- `POST /api/coaching/rag`
- `GET/POST/DELETE /api/coaching/conversations`
- `DELETE /api/coaching/conversations/[id]`

### Interview

- `POST /api/interview`
- `GET/POST /api/interview/results`

### Trading and Analytics

- `GET /api/alpaca/account`
- `GET/POST /api/alpaca/orders`
- `DELETE /api/alpaca/orders/[orderId]`
- `GET /api/alpaca/positions`
- `GET /api/alpaca/bars/[symbol]`
- `GET /api/alpaca/sessions`
- `GET /api/alpaca/behavioral`
- `GET /api/alpaca/performance`
- `GET /api/analysis/smart-beta`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/user`

## Local Development

Prerequisites:

- Node.js 20+
- Python 3.10+
- npm + pip

Setup:

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r router/requirements.txt
pip install -r ml-development/etf-analysis/requirements.txt
pip install -r ml-development/rag-pipeline/requirements.txt
pip install -r ml-development/interview-pipeline/requirements.txt
cp .env.local.example .env.local
npm run dev
```

App URL:

- `http://localhost:3000`

## Operations and Diagnostics

Useful docs:

- `docs/start-documentation.md`
- `docs/responsible-ai-study-plan-tool-logging.md`
- `docs/view-registered-records.md`

Inspect study-plan audit logs:

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week
tail -n 20 data/responsible-ai/study-plan-tool-audit.ndjson
```

## Known Limitations

- Development-grade authentication and credential handling.
- Mixed localStorage + SQLite persistence with no tenant isolation controls.
- Limited automated test coverage and no CI safety suite in repo.
- Some AI flows depend on external model quality and are not deterministically reproducible.

## Recommended Next Steps

1. Add a unified AI policy middleware for moderation, redaction, and risk tagging.
2. Introduce database migrations with schema versioning and secure password hashing.
3. Add offline evaluation harness for readiness-plan quality and recommendation calibration.
4. Implement explicit learner consent controls for cross-signal personalization.
5. Add end-to-end tests for critical APIs (study-plan, quiz-progress, interview persistence).

## Repository Map

```text
app/                     Next.js routes and UI pages
app/api/                 Server endpoints
components/              UI components and feature tabs
contexts/                Auth and notification state providers
lib/                     Shared types, data clients, persistence helpers
ml-development/          Python AI pipelines (RAG, interview, resume, readiness, ETF)
router/                  Query complexity router training/inference
docs/                    Operational and feature documentation
data/                    Local runtime data (sqlite, resumes, audit logs)
```

---

This documentation is written to support both implementation onboarding and Responsible AI review. For production deployment, treat the Responsible AI gap section as mandatory hardening work rather than optional improvement.

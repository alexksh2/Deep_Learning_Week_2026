# Responsible AI Framework for Quant Learning OS (QLOS)

Version: 1.0  
Last updated: 2026-03-03  
Applies to: all AI-enabled product surfaces in this repository

## 1) Purpose

This document defines how QLOS should be designed, operated, and audited as a responsible AI learning system.

It is intended to be:

- an engineering implementation guide
- a governance artifact for safety and compliance review
- an operational playbook for monitoring and incident response

This is not a marketing statement. It is a control framework with explicit requirements, current-state evidence, and remediation priorities.

## 2) Scope

In-scope AI subsystems:

1. Chat + query router (`/api/chat`, `router/`)
2. Coaching RAG (`/api/coaching/rag`, `ml-development/rag-pipeline/`)
3. Resume analysis (`/api/profile/resume`, `ml-development/resume-analysis/`)
4. Interview pipeline (`/api/interview`, `ml-development/interview-pipeline/`)
5. Agentic readiness planning (`/api/profile/readiness/study-plan`, `ml-development/readiness-agent/`)
6. Data-driven readiness recommendations (`components/profile/ReadinessTab.tsx`)

Out-of-scope:

- Non-AI UI rendering concerns.
- External provider internals (OpenAI, Alpaca, yfinance).

## 3) Responsible AI Objectives

QLOS must satisfy these outcomes:

1. Beneficial guidance: outputs should help learners take concrete, high-value next actions.
2. Non-deceptive behavior: users should understand where guidance came from and how confident the system is.
3. Bounded risk: the system should avoid harmful overreach, unsafe claims, or brittle high-stakes advice.
4. Auditability: critical AI decisions must be reconstructable after the fact.
5. Privacy-respecting personalization: model behavior should use learner data proportionally and with clear purpose.

## 4) AI Data Lifecycle and Trust Boundaries

Primary data flows:

1. User input and profile signals are sent to Next.js API routes.
2. Selected routes pass payloads to Python subprocesses for AI processing.
3. AI outputs are returned to UI and sometimes persisted.
4. Some workflows emit trace/audit records.

Current persistent stores:

- `data/auth.sqlite`
- `data/resumes/`
- `data/responsible-ai/study-plan-tool-audit.ndjson`
- browser local storage (`qlos_session`, notifications, profile client state)

Critical trust boundaries:

1. Browser to API boundary.
2. API to subprocess boundary.
3. API to external model boundary.
4. Application logs and local data stores boundary.

## 5) Risk Taxonomy

### 5.1 User-impact risks

1. Misleading learning guidance:
- Incorrect or weakly supported recommendations may waste user study time.

2. Hallucinated or overconfident statements:
- Particularly in chat, interview feedback, and resume-derived suggestions.

3. Optimization on noisy proxies:
- Readiness scores can drift if source signals are sparse or biased.

4. Behavioral overreach:
- Trade-related coaching can be interpreted as high-confidence decision support.

### 5.2 Fairness and bias risks

1. Profile-derived personalization can encode bias:
- Role preferences, school context, and resume style may systematically influence recommendations.

2. Uneven quality across learner backgrounds:
- Users with sparse histories may receive lower-quality planning.

### 5.3 Privacy and security risks

1. Plaintext credentials in local SQLite.
2. Conversation payload persistence without PII redaction.
3. Mixed storage locations with no enforced retention lifecycle.

### 5.4 Governance risks

1. Missing unified moderation policy.
2. Inconsistent logging standards across AI routes.
3. No formal release gate requiring Responsible AI checks.

## 6) Control Stack

Controls are categorized as `Implemented`, `Partially Implemented`, or `Required`.

### 6.1 Input controls

Implemented:

- Basic payload validation in API routes.
- Typed parsing and fallback behavior in several endpoints.

Required:

- Unified schema validation contracts for all AI-bound payloads.
- Input safety classifier for prompt injection and unsafe intent patterns.
- PII scrubbing pass before persistence.

### 6.2 Model and tool controls

Implemented:

- Agentic study planner uses explicit function tools.
- Tool traces captured per call for readiness planner.
- Deterministic fallback when model output is invalid.

Partially Implemented:

- RAG evaluation includes claim-support scoring, but not enforced gating.

Required:

- Model registry and version pinning per endpoint.
- Policy-based tool allowlist enforcement across agentic flows.
- Confidence-based routing to fallback/human review for low-certainty outputs.

### 6.3 Output controls

Implemented:

- Study-plan output sanitization and clamping.
- RAG citations surfaced to user.
- Readiness scoring formula explained in UI tooltip.

Required:

- Unified post-generation moderation layer.
- Confidence communication standard (all high-impact outputs).
- Explicit uncertainty language policy for unsupported claims.

### 6.4 Auditability controls

Implemented:

- Append-only study-plan audit log with request and tool summaries.

Required:

- Consistent audit schema across chat, interview, resume, and RAG routes.
- Redaction-aware logging with configurable retention.
- Runbook to correlate user-visible outputs with backend traces.

## 7) Feature-by-Feature Responsible AI Requirements

## 7.1 Readiness study plan agent

Current state evidence:

- route: `app/api/profile/readiness/study-plan/route.ts`
- agent: `ml-development/readiness-agent/study_plan_agent.py`
- audit log: `data/responsible-ai/study-plan-tool-audit.ndjson`

Required behavior:

1. Always return a bounded, actionable plan even if model/tool path fails.
2. Expose source path (`agent` vs `fallback`) and rationale.
3. Preserve per-tool trace for post-hoc review.
4. Prevent malformed plan rows from reaching UI.

Hard requirements:

- `durationMinutes` must be clamped and non-zero.
- `task` and `target` must be non-empty.
- fallback reason must be included when fallback path is taken.

## 7.2 Coaching RAG

Current state evidence:

- route: `app/api/coaching/rag/route.ts`
- pipeline: `ml-development/rag-pipeline/rag_cli.py`

Required behavior:

1. Retrieval-grounded answers with citation identifiers.
2. Distinguish cited vs uncited claims.
3. Avoid presenting unsupported assertions as facts.

Hard requirements:

- if retrieval fails, return explicit error; do not fabricate answer
- if evaluation is unavailable, UI should indicate reduced confidence
- for multi-document answers, preserve source attribution per segment

## 7.3 Interview pipeline

Current state evidence:

- route: `app/api/interview/route.ts`
- scorer/prompt logic: `ml-development/interview-pipeline/interview_llm.py`

Required behavior:

1. Keep feedback format stable and parsable.
2. Avoid toxic, demeaning, or identity-targeting language.
3. Treat generated scores as coaching signals, not objective truth.

Hard requirements:

- include guardrail prompt language prohibiting abusive output
- include score uncertainty note in UI and exports
- audit store should retain normalized score rows and timestamps

## 7.4 Resume analysis

Current state evidence:

- route: `app/api/profile/resume/route.ts`
- analyzer: `ml-development/resume-analysis/api.py`

Required behavior:

1. Use evidence-backed extraction for inferred skills.
2. Keep unsupported inferences low confidence or omit them.
3. Avoid deterministic career judgments presented as guarantees.

Hard requirements:

- preserve evidence snippets per extracted skill where available
- cap confidence language for low-evidence outputs
- do not store raw resume text in broad audit logs

## 7.5 Readiness scoring and recommendations

Current state evidence:

- implementation: `components/profile/ReadinessTab.tsx`

Required behavior:

1. Formula transparency at point of use.
2. Graceful fallback under sparse data.
3. Recommendations must reference observable signals, not opaque heuristics.

Hard requirements:

- keep weighting logic documented and versioned
- log score component inputs in diagnostic mode
- avoid hidden feature usage that cannot be explained to user

## 8) Explainability Contract

Every high-impact AI output (study plan, interview summary, readiness recommendations) should provide:

1. What:
- the recommendation or score delivered

2. Why:
- evidence summary and key drivers

3. How sure:
- confidence level or explicit uncertainty

4. What next:
- concrete, time-bounded action to validate or improve outcome

This contract reduces overreliance and keeps user agency intact.

## 9) Privacy and Data Governance Policy

Minimum policy requirements:

1. Data minimization:
- store only fields required for product functionality and audits

2. Purpose limitation:
- reuse learner data only for learning guidance and product safety controls

3. Retention control:
- define expiration windows for conversations, traces, and derived artifacts

4. User control:
- user-visible export and deletion paths for stored artifacts

5. Secret and credential safety:
- no plaintext passwords in persistent stores

Current gap summary:

- credentials are plaintext in local SQLite
- retention is not enforced
- PII redaction is not standardized for logs

## 10) Fairness and Bias Governance

Fairness objectives:

1. Similar performance quality across user subgroups.
2. No systematic recommendation suppression by proxy attributes.
3. Transparent handling of low-data users.

Required evaluation slices:

1. New users vs experienced users.
2. Sparse-data vs rich-data learners.
3. Different target roles and learning-style preferences.

Required fairness checks:

1. Recommendation quality parity by slice.
2. False-negative rate parity for high-impact recommendations.
3. Calibration parity for readiness confidence statements.

## 11) Evaluation and Monitoring

## 11.1 Offline evaluation suites

Required suites:

1. Hallucination suite:
- adversarial prompts for unsupported claims.

2. Grounding suite:
- citation precision/recall for RAG answers.

3. Planning quality suite:
- study-plan usefulness, specificity, and feasibility ratings.

4. Robustness suite:
- malformed inputs, missing fields, long inactivity histories.

5. Fairness suite:
- metrics sliced by user/context cohorts.

## 11.2 Online monitoring

Required production metrics:

1. Fallback rate per endpoint.
2. Tool error rate for agentic plans.
3. Uncited-claim rate in RAG answers.
4. Unsafe-output block rate (after moderation is added).
5. User override/ignore rate for recommendations.

Alerting examples:

- sudden spike in fallback rate
- increased unsupported claim ratio
- elevated low-confidence outputs without warning tags

## 12) Incident Response

Incident severity classes:

1. Sev-1:
- harmful or unsafe high-impact guidance at scale.

2. Sev-2:
- repeated misleading outputs with moderate user impact.

3. Sev-3:
- isolated defects with recoverable impact.

Required response workflow:

1. Detect and triage.
2. Contain (disable feature/model path if needed).
3. Root-cause analysis (input, model, tool, persistence, UX).
4. Remediate (patch + tests + backfill audits).
5. Post-incident report and control update.

## 13) Release Gates for AI Features

An AI feature is not production-ready unless all gates pass:

1. Safety gate:
- moderation and unsafe-content controls implemented.

2. Reliability gate:
- fallback behavior proven under failure modes.

3. Explainability gate:
- "what/why/how sure/what next" contract visible in UX.

4. Audit gate:
- traceability from user action to model/tool outputs.

5. Privacy gate:
- retention and redaction policies implemented.

6. Fairness gate:
- documented bias evaluation with acceptable thresholds.

## 14) Current Maturity Snapshot (as of 2026-03-03)

Strengths:

1. Strongest auditability is already present in readiness planning.
2. Deterministic fallback architecture is implemented in multiple pipelines.
3. UI-level readiness formula transparency is present.
4. RAG has citation and evaluation scaffolding.

Critical gaps:

1. Auth and credential handling is development-only.
2. No unified moderation layer across AI endpoints.
3. No standardized retention/redaction enforcement.
4. Fairness evaluation is not yet operationalized.
5. Governance checks are not integrated into release process.

## 15) Implementation Roadmap

Phase 0 (Immediate, P0):

1. Hash and salt credentials in auth storage.
2. Add global moderation wrapper for AI responses.
3. Add PII redaction utilities for logs and audit artifacts.
4. Add retention settings and purge jobs for local stores.

Phase 1 (Near-term, P1):

1. Standardize audit schema across AI routes.
2. Add offline evaluation harness (hallucination, grounding, planning quality).
3. Add confidence and uncertainty labels to high-impact UI outputs.
4. Add explicit user consent controls for cross-signal personalization.

Phase 2 (Mid-term, P2):

1. Add fairness scorecards and periodic governance reviews.
2. Add human-review workflow for low-confidence or high-risk cases.
3. Add model registry/version governance and deployment approvals.

## 16) Developer Checklist

Before merging AI feature changes:

1. Confirm fallback path behavior for model and tool failures.
2. Confirm output schema validation and clamping.
3. Confirm explainability fields are populated.
4. Confirm no sensitive raw payloads are logged.
5. Confirm test cases include malformed and adversarial inputs.
6. Confirm audit trail fields are emitted and documented.

## 17) Relationship to Existing Docs

This framework is the top-level Responsible AI guide.  
For endpoint-specific trace details of the study-plan subsystem, see:

- `docs/responsible-ai-study-plan-tool-logging.md`


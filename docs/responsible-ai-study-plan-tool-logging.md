# Responsible AI: Study-Plan Tool Logging

This system uses an agentic planner to generate readiness study plans. To support responsible AI review, every tool call is traced and every generation request is written to an audit log.

For the broader Responsible AI policy, governance model, and release gates across all AI subsystems, see:

- `docs/responsible-ai-framework.md`

## Agent tools

The study-plan agent currently exposes two tools:

1. `rank_readiness_gaps`
2. `build_seed_plan`

Tool implementations are in:

- `ml-development/readiness-agent/study_plan_agent.py`

## Runtime trace fields

Each generated plan includes `toolTrace` entries with:

- `step`: invocation order within the run
- `toolName`: tool function name
- `arguments`: parsed tool arguments
- `outputSummary`: short, human-readable result summary
- `status`: `ok` or `error`
- `invokedAt`: UTC ISO-8601 timestamp

If the model output is invalid and the planner falls back, `fallbackReason` is included.

## Persistent audit log

Every API request to `/api/profile/readiness/study-plan` appends one NDJSON record to:

- `data/responsible-ai/study-plan-tool-audit.ndjson`

Audit record fields include:

- `auditId`: unique request identifier
- `startedAt` and `loggedAt`
- `status`: `ok` or `error`
- `requestSummary`: compact, non-verbatim request summary (scores/counts)
- `responseSummary`: source, session count, weekly minutes, tool count, fallback reason
- `toolTrace`: per-tool trace entries from the agent
- `model`: model identifier used by the endpoint (success path)
- `error`: error message (error path)

## Operational notes

- Logging is append-only.
- Logging failures are printed to server logs under `[readiness_study_plan_audit]`.
- Study-plan generation still returns a response even if audit persistence fails.

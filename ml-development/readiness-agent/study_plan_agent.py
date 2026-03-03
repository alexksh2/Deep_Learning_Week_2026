#!/usr/bin/env python3
"""
Agentic readiness study-plan generator.

Input: JSON via stdin with keys:
  - composite: number
  - breakdown: [{ key, label, score }]
  - recommendations: [{ title, estimatedMinutes, impact, because, evidenceLink }]
  - hoursPerWeek: optional number
  - targetRole: optional string

Output JSON:
{
  "plan": [{ "session", "focus", "task", "durationMinutes", "target" }],
  "weeklyMinutes": number,
  "rationale": string,
  "source": "agent" | "fallback",
  "toolTrace": [{ "step", "toolName", "arguments", "outputSummary", "status", "invokedAt" }],
  "generatedAt": "ISO8601",
  "weeklyOutlook": [{ "week", "focus", "milestone", "estimatedMinutes" }],  // optional
  "prompt": { "system": string, "user": string }  // optional when includePrompt=true
}
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

COMPONENT_WEIGHTS: Dict[str, float] = {
    "theory": 0.30,
    "implementation": 0.25,
    "execution": 0.30,
    "communication": 0.15,
}

WEEKLY_GAIN_RATE: Dict[str, float] = {
    "theory": 2.5,
    "implementation": 3.0,
    "execution": 2.0,
    "communication": 2.5,
}

DRILL_TEMPLATES: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "theory": {
        "beginner": [
            {"template": "Read one chapter on {topic} and summarise key formulas in your own words.", "topicHint": "probability distributions", "durationHintMinutes": 30},
            {"template": "Watch a 20-minute explainer on {topic}, then answer 10 concept-check questions.", "topicHint": "stochastic processes", "durationHintMinutes": 25},
        ],
        "intermediate": [
            {"template": "Derive the {topic} formula from first principles and verify with two worked examples.", "topicHint": "Black-Scholes", "durationHintMinutes": 40},
            {"template": "Write a one-page summary of {topic} covering intuition, assumptions, and edge cases.", "topicHint": "Ito calculus", "durationHintMinutes": 35},
        ],
        "advanced": [
            {"template": "Prove {topic} rigorously and identify where each assumption is used.", "topicHint": "Girsanov theorem", "durationHintMinutes": 60},
            {"template": "Critique three common misconceptions about {topic} and write counter-arguments.", "topicHint": "risk-neutral pricing", "durationHintMinutes": 50},
        ],
    },
    "implementation": {
        "beginner": [
            {"template": "Implement {topic} from scratch in Python with no library help; time yourself.", "topicHint": "binary search", "durationHintMinutes": 30},
            {"template": "Translate a pseudocode description of {topic} into working Python and test with 3 cases.", "topicHint": "moving average crossover", "durationHintMinutes": 25},
        ],
        "intermediate": [
            {"template": "Implement {topic} under a 45-minute time limit, then write a post-mortem on what slowed you.", "topicHint": "LRU cache", "durationHintMinutes": 45},
            {"template": "Refactor your {topic} implementation for O(n log n) complexity and benchmark it.", "topicHint": "order book matching", "durationHintMinutes": 40},
        ],
        "advanced": [
            {"template": "Design and implement {topic} handling edge cases for production-grade use; review with a peer.", "topicHint": "tick data aggregator", "durationHintMinutes": 60},
            {"template": "Implement {topic} with full error handling and write a spec document of design decisions.", "topicHint": "position sizing engine", "durationHintMinutes": 55},
        ],
    },
    "execution": {
        "beginner": [
            {"template": "Run a paper-trading session focused on {topic}, logging every entry and exit decision.", "topicHint": "stop-loss discipline", "durationHintMinutes": 30},
            {"template": "Simulate 10 trades for {topic} in a simulator and record pre-trade risk checks.", "topicHint": "position sizing", "durationHintMinutes": 25},
        ],
        "intermediate": [
            {"template": "Execute a full trading session on {topic} with a hard max-loss limit; debrief afterwards.", "topicHint": "intraday momentum", "durationHintMinutes": 45},
            {"template": "Set strict entry criteria for {topic} and review trade log for rule violations.", "topicHint": "mean reversion", "durationHintMinutes": 40},
        ],
        "advanced": [
            {"template": "Trade {topic} live with a pre-defined edge case playbook; review slippage and timing.", "topicHint": "market-open volatility", "durationHintMinutes": 60},
            {"template": "Design and execute a multi-leg {topic} strategy under simulated stress conditions.", "topicHint": "pairs trade", "durationHintMinutes": 55},
        ],
    },
    "communication": {
        "beginner": [
            {"template": "Record a 5-minute verbal explanation of {topic} and play it back to identify unclear parts.", "topicHint": "a solved coding problem", "durationHintMinutes": 20},
            {"template": "Write a one-paragraph ELI5 description of {topic} without jargon.", "topicHint": "delta hedging", "durationHintMinutes": 15},
        ],
        "intermediate": [
            {"template": "Give a 10-minute mock whiteboard walkthrough of {topic} to a peer or recording device.", "topicHint": "an options pricing model", "durationHintMinutes": 30},
            {"template": "Prepare and deliver a structured 5-W answer (What, Why, How, Trade-offs, Result) for {topic}.", "topicHint": "a recent trading mistake", "durationHintMinutes": 25},
        ],
        "advanced": [
            {"template": "Conduct a full mock interview on {topic} with live Q&A and timed 30-second summaries.", "topicHint": "market microstructure", "durationHintMinutes": 45},
            {"template": "Create a one-pager explaining {topic} as if presenting to a senior risk manager.", "topicHint": "Greeks exposure management", "durationHintMinutes": 40},
        ],
    },
}


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def clamp(value: float, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(round(value))))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_payload(raw: str) -> Dict[str, Any]:
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Payload must be a JSON object.")
    return data


def normalized_inputs(payload: Dict[str, Any]) -> Tuple[int, List[Dict[str, Any]], List[Dict[str, Any]], int, str]:
    composite = clamp(float(payload.get("composite", 50)), 0, 100)
    hours_per_week = clamp(float(payload.get("hoursPerWeek", 4)), 1, 20)
    target_role = str(payload.get("targetRole", "Quant Trading")).strip() or "Quant Trading"

    breakdown_raw = payload.get("breakdown", [])
    recommendations_raw = payload.get("recommendations", [])

    breakdown: List[Dict[str, Any]] = []
    if isinstance(breakdown_raw, list):
        for idx, row in enumerate(breakdown_raw):
            if not isinstance(row, dict):
                continue
            key = str(row.get("key", f"component_{idx}")).strip().lower()
            label = str(row.get("label", key)).strip() or key
            score = clamp(float(row.get("score", 50)), 0, 100)
            breakdown.append({"key": key, "label": label, "score": score, "gap": 100 - score})

    if not breakdown:
        breakdown = [
            {"key": "theory", "label": "Theory Mastery", "score": 50, "gap": 50},
            {"key": "implementation", "label": "Implementation Reliability", "score": 50, "gap": 50},
            {"key": "execution", "label": "Execution Discipline", "score": 50, "gap": 50},
            {"key": "communication", "label": "Communication Clarity", "score": 50, "gap": 50},
        ]

    recommendations: List[Dict[str, Any]] = []
    if isinstance(recommendations_raw, list):
        for row in recommendations_raw:
            if not isinstance(row, dict):
                continue
            recommendations.append(
                {
                    "title": str(row.get("title", "")).strip(),
                    "estimatedMinutes": clamp(float(row.get("estimatedMinutes", 20)), 10, 90),
                    "impact": str(row.get("impact", "Medium")).strip() or "Medium",
                    "because": str(row.get("because", "")).strip(),
                    "evidenceLink": str(row.get("evidenceLink", "")).strip(),
                }
            )

    return composite, breakdown, recommendations, hours_per_week, target_role


def sort_gaps(breakdown: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(breakdown, key=lambda row: (row.get("score", 50), -row.get("gap", 0)))


def map_rec_to_component(component_key: str, rec: Dict[str, Any]) -> bool:
    link = str(rec.get("evidenceLink", ""))
    title = str(rec.get("title", "")).lower()
    if component_key == "theory":
        return "/resume" in link or "resume" in title or "module" in title
    if component_key == "implementation":
        return "/interview" in link or "interview" in title or "coding" in title
    if component_key == "execution":
        return "/trade" in link or "risk" in title or "stop-loss" in title or "simulator" in title
    if component_key == "communication":
        return "/interview" in link or "communication" in title or "walkthrough" in title
    return False


def fallback_task_for(component_key: str) -> str:
    if component_key == "theory":
        return "Review one weak theory topic and complete 8 targeted concept questions."
    if component_key == "implementation":
        return "Solve one timed implementation prompt and write a concise post-mortem."
    if component_key == "execution":
        return "Run one simulator session with strict risk limits and stop-loss discipline."
    if component_key == "communication":
        return "Record a 5-minute explanation for one solved problem and refine clarity."
    return "Run one focused drill and log key mistakes with corrective actions."


def _difficulty_level(composite: int) -> str:
    if composite < 40:
        return "beginner"
    if composite < 65:
        return "intermediate"
    return "advanced"


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

def tool_rank_gaps(payload: Dict[str, Any]) -> Dict[str, Any]:
    _, breakdown, _, _, _ = normalized_inputs(payload)
    ranked = sort_gaps(breakdown)
    return {"ranked": ranked[:4]}


def tool_build_seed_plan(payload: Dict[str, Any], top_n: int = 3) -> Dict[str, Any]:
    """Returns context the LLM uses to write its own task descriptions."""
    composite, breakdown, recommendations, hours_per_week, target_role = normalized_inputs(payload)
    ranked = sort_gaps(breakdown)[: max(1, min(top_n, 4))]
    budget = hours_per_week * 60

    total_gap = sum(c["gap"] for c in ranked) or 1
    difficulty = _difficulty_level(composite)

    components_ctx = []
    for rank_idx, component in enumerate(ranked):
        key = component["key"]
        gap = component["gap"]
        weight = COMPONENT_WEIGHTS.get(key, 0.25)
        suggested_minutes = clamp(budget * (gap / total_gap), 15, 90)

        linked = next((rec for rec in recommendations if map_rec_to_component(key, rec)), None)
        if linked and linked.get("because"):
            evidence_ctx = linked["because"][:120]
        else:
            evidence_ctx = fallback_task_for(key)

        components_ctx.append({
            "rank": rank_idx + 1,
            "key": key,
            "label": component["label"],
            "score": component["score"],
            "gap": gap,
            "weight": weight,
            "suggestedMinutes": suggested_minutes,
            "evidenceContext": evidence_ctx,
        })

    return {
        "components": components_ctx,
        "budgetMinutes": budget,
        "hoursPerWeek": hours_per_week,
        "targetRole": target_role,
        "composite": composite,
        "difficultyLevel": difficulty,
        "instruction": (
            "Write your own task description for each component. "
            "Name a concrete deliverable (e.g. 'implement X', 'record Y', 'derive Z'). "
            "Use the evidenceContext and drill templates as inspiration only — do not copy them verbatim."
        ),
    }


def tool_get_drill_templates(component_key: str, difficulty: str, target_role: str) -> Dict[str, Any]:
    """Returns 2-3 drill templates for a given component + difficulty."""
    key = component_key.lower().strip()
    diff = difficulty.lower().strip()
    if diff not in ("beginner", "intermediate", "advanced"):
        diff = "intermediate"

    component_templates = DRILL_TEMPLATES.get(key, {})
    templates = component_templates.get(diff, [])

    # Fallback: try intermediate if exact difficulty not found
    if not templates and diff != "intermediate":
        templates = component_templates.get("intermediate", [])

    return {
        "component": key,
        "difficulty": diff,
        "targetRole": target_role,
        "templates": templates,
    }


def tool_score_plan(payload: Dict[str, Any], sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Validates a draft session list against budget and coverage."""
    _, breakdown, _, hours_per_week, _ = normalized_inputs(payload)
    budget_minutes = hours_per_week * 60

    if not isinstance(sessions, list):
        return {"score": 0, "budgetOk": False, "usedMinutes": 0, "budgetMinutes": budget_minutes,
                "coverageRatio": 0.0, "sessionCount": 0, "issues": ["sessions must be a list"]}

    issues: List[str] = []
    used_minutes = 0
    for s in sessions:
        if isinstance(s, dict):
            used_minutes += clamp(float(s.get("durationMinutes", 0)), 0, 600)

    session_count = len(sessions)

    # Budget compliance: used ≤ budget * 1.1
    budget_ok = used_minutes <= budget_minutes * 1.1
    if not budget_ok:
        issues.append(f"Used {used_minutes}m exceeds budget {budget_minutes}m by more than 10%.")

    # Session count 1-6
    if not (1 <= session_count <= 6):
        issues.append(f"Session count {session_count} is outside 1-6 range.")

    # Coverage: fraction of breakdown components with at least one session targeting them
    breakdown_keys = {c["key"] for c in breakdown}
    covered_keys: set = set()
    for s in sessions:
        if not isinstance(s, dict):
            continue
        focus = str(s.get("focus", "")).lower()
        task = str(s.get("task", "")).lower()
        combined = focus + " " + task
        for bk in breakdown_keys:
            if bk in combined:
                covered_keys.add(bk)
    coverage_ratio = len(covered_keys) / max(1, len(breakdown_keys))
    if coverage_ratio < 0.5:
        issues.append(f"Coverage ratio {coverage_ratio:.2f} — fewer than half of components are addressed.")

    # Score: start at 100, subtract penalties
    score = 100
    if not budget_ok:
        score -= 25
    if session_count < 1 or session_count > 6:
        score -= 20
    if coverage_ratio < 0.5:
        score -= 20
    elif coverage_ratio < 0.75:
        score -= 10
    score = clamp(score, 0, 100)

    return {
        "score": score,
        "budgetOk": budget_ok,
        "usedMinutes": used_minutes,
        "budgetMinutes": budget_minutes,
        "coverageRatio": round(coverage_ratio, 2),
        "sessionCount": session_count,
        "issues": issues,
    }


def tool_estimate_weeks_to_target(
    component_key: str,
    current_score: float,
    target_score: float,
    hours_per_week: float,
) -> Dict[str, Any]:
    """Estimates weeks needed to reach target score for a component."""
    key = component_key.lower().strip()
    base_rate = WEEKLY_GAIN_RATE.get(key, 2.5)  # points per week at 4h baseline

    # Scale by hours; cap multiplier at 1.5x
    scale = min(hours_per_week / 4.0, 1.5)
    effective_rate = base_rate * scale

    gap = max(0.0, float(target_score) - float(current_score))
    weeks_estimate = gap / effective_rate if effective_rate > 0 else 999

    return {
        "componentKey": key,
        "currentScore": float(current_score),
        "targetScore": float(target_score),
        "gap": round(gap, 1),
        "weeksEstimate": round(weeks_estimate, 1),
        "hoursPerWeekAssumed": float(hours_per_week),
        "weeklyGainRateAssumed": round(effective_rate, 2),
        "note": f"At {hours_per_week:.1f}h/week the effective gain rate is {effective_rate:.2f} pts/week.",
    }


# ---------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------

def deterministic_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    composite, breakdown, recommendations, hours_per_week, _target_role = normalized_inputs(payload)
    ranked = sort_gaps(breakdown)
    weakest = ranked[:3]

    baseline_weekly_minutes = hours_per_week * 60
    plan: List[Dict[str, Any]] = []

    for idx, component in enumerate(weakest):
        linked = next((rec for rec in recommendations if map_rec_to_component(component["key"], rec)), None)
        duration = linked["estimatedMinutes"] if linked else 25
        plan.append(
            {
                "session": f"Session {idx + 1}",
                "focus": component["label"],
                "task": linked["title"] if linked and linked.get("title") else fallback_task_for(component["key"]),
                "durationMinutes": clamp(duration, 15, 90),
                "target": f"Raise {component['label']} to at least {clamp(component['score'] + 8, 0, 100)}/100.",
            }
        )

    used_minutes = sum(int(item["durationMinutes"]) for item in plan)
    remaining = max(20, baseline_weekly_minutes - used_minutes)
    plan.append(
        {
            "session": f"Session {len(plan) + 1}",
            "focus": "Integrated Review",
            "task": "Review interview and trading errors, then retest the weakest component under time pressure.",
            "durationMinutes": clamp(remaining, 20, 90),
            "target": f"Lift composite readiness from {composite}/100 to {clamp(composite + 3, 0, 100)}/100 or above.",
        }
    )

    weekly_minutes = sum(int(item["durationMinutes"]) for item in plan)
    rationale = "Plan prioritizes lowest-scoring readiness components first, then consolidates with an integrated review session."
    return {
        "plan": plan,
        "weeklyMinutes": weekly_minutes,
        "rationale": rationale,
        "source": "fallback",
        "toolTrace": [],
        "generatedAt": utc_now_iso(),
    }


# ---------------------------------------------------------------------------
# Summarize tool results
# ---------------------------------------------------------------------------

def summarize_tool_result(tool_name: str, tool_result: Dict[str, Any]) -> str:
    if tool_name == "rank_readiness_gaps":
        ranked = tool_result.get("ranked", [])
        if isinstance(ranked, list) and ranked:
            top = ranked[0] if isinstance(ranked[0], dict) else {}
            label = str(top.get("label", "unknown"))
            gap = top.get("gap", "?")
            return f"Ranked {len(ranked)} components. Top gap: {label} ({gap} points)."
        return "Ranked readiness gaps."
    if tool_name == "build_seed_plan":
        components = tool_result.get("components", [])
        budget = tool_result.get("budgetMinutes", "?")
        difficulty = tool_result.get("difficultyLevel", "?")
        count = len(components) if isinstance(components, list) else 0
        return f"Built seed plan context for {count} components, {budget}m budget, difficulty={difficulty}."
    if tool_name == "get_drill_templates":
        templates = tool_result.get("templates", [])
        component = tool_result.get("component", "?")
        difficulty = tool_result.get("difficulty", "?")
        count = len(templates) if isinstance(templates, list) else 0
        return f"Retrieved {count} drill templates for {component} at {difficulty} level."
    if tool_name == "score_plan":
        score = tool_result.get("score", "?")
        budget_ok = tool_result.get("budgetOk", "?")
        coverage = tool_result.get("coverageRatio", "?")
        issues = tool_result.get("issues", [])
        issue_str = f" Issues: {'; '.join(issues)}" if issues else ""
        return f"Plan score: {score}/100. BudgetOk={budget_ok}, Coverage={coverage}.{issue_str}"
    if tool_name == "estimate_weeks_to_target":
        key = tool_result.get("componentKey", "?")
        weeks = tool_result.get("weeksEstimate", "?")
        gap = tool_result.get("gap", "?")
        return f"Estimated {weeks} weeks to close {gap}-point gap in {key}."
    if "error" in tool_result:
        return f"Tool error: {tool_result.get('error')}"
    return "Tool executed."


# ---------------------------------------------------------------------------
# Build prompts
# ---------------------------------------------------------------------------

def build_prompts(payload: Dict[str, Any]) -> Dict[str, str]:
    composite, breakdown, _, hours_per_week, target_role = normalized_inputs(payload)
    difficulty = _difficulty_level(composite)
    budget_minutes = hours_per_week * 60

    system_prompt = (
        "You are an agentic quant-learning coach. You MUST call tools in this exact order before writing your final response:\n"
        "1. Call rank_readiness_gaps to identify the weakest components.\n"
        "2. For each weak component (up to 3), call get_drill_templates(component_key, difficulty) to fetch inspiration.\n"
        "3. Call build_seed_plan(top_n=3) to get context, budget, and difficulty level.\n"
        "4. For each weak component, call estimate_weeks_to_target(component_key, current_score, target_score=75) to project timelines.\n"
        "5. Draft your plan, then call score_plan(sessions) to validate it. If score < 70, revise once.\n\n"
        "Task-writing rules:\n"
        "- Write EVERY task description yourself. Do NOT copy recommendation titles or template strings verbatim.\n"
        "- Name a concrete deliverable: what the learner will produce, implement, record, or prove.\n"
        "- Use drill templates as structural inspiration only; personalise to the learner's target role and score.\n"
        "- Keep task text under 120 characters.\n\n"
        "Output compact JSON only. No markdown. No prose outside the JSON object."
    )

    user_prompt = json.dumps(
        {
            "learnerProfile": {
                "targetRole": target_role,
                "hoursPerWeek": hours_per_week,
                "weeklyBudgetMinutes": budget_minutes,
                "difficultyLevel": difficulty,
                "compositeScore": composite,
            },
            "objective": "Generate a personalised AI readiness study plan",
            "constraints": {
                "maxSessions": 6,
                "minSessionMinutes": 15,
                "maxSessionMinutes": 90,
                "budgetMinutes": budget_minutes,
            },
            "input": payload,
            "outputSchema": {
                "plan": [
                    {
                        "session": "Session 1",
                        "focus": "Execution Discipline",
                        "task": "Your own LLM-authored task description — concrete deliverable",
                        "durationMinutes": 30,
                        "target": "Measurable target",
                    }
                ],
                "rationale": "Short rationale referencing tool findings",
                "weeklyOutlook": [
                    {
                        "week": 1,
                        "focus": "Theme for the week",
                        "milestone": "Specific measurable milestone",
                        "estimatedMinutes": budget_minutes,
                    }
                ],
            },
        }
    )
    return {"system": system_prompt, "user": user_prompt}


# ---------------------------------------------------------------------------
# Output sanitization
# ---------------------------------------------------------------------------

def sanitize_agent_output(
    candidate: Dict[str, Any],
    fallback: Dict[str, Any],
    tool_trace: List[Dict[str, Any]],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    plan_in = candidate.get("plan")
    if not isinstance(plan_in, list) or len(plan_in) == 0:
        return {
            **fallback,
            "toolTrace": tool_trace,
            "fallbackReason": "Agent response had no plan array.",
        }

    cleaned: List[Dict[str, Any]] = []
    for idx, row in enumerate(plan_in[:6]):
        if not isinstance(row, dict):
            continue
        session = str(row.get("session", f"Session {idx + 1}")).strip() or f"Session {idx + 1}"
        focus = str(row.get("focus", "Focus Area")).strip() or "Focus Area"
        task = str(row.get("task", "")).strip()
        target = str(row.get("target", "")).strip()
        if not task or not target:
            continue
        cleaned.append(
            {
                "session": session,
                "focus": focus,
                "task": task,
                "durationMinutes": clamp(float(row.get("durationMinutes", 25)), 15, 90),
                "target": target,
            }
        )

    if len(cleaned) == 0:
        return {
            **fallback,
            "toolTrace": tool_trace,
            "fallbackReason": "Agent response plan rows were invalid after sanitization.",
        }

    weekly_minutes = sum(int(item["durationMinutes"]) for item in cleaned)
    rationale = str(candidate.get("rationale", "")).strip()
    if not rationale:
        rationale = "Plan generated by agent after ranking readiness gaps and mapping evidence-backed drills."

    result: Dict[str, Any] = {
        "plan": cleaned,
        "weeklyMinutes": weekly_minutes,
        "rationale": rationale,
        "source": "agent",
        "toolTrace": tool_trace,
        "generatedAt": utc_now_iso(),
    }

    # Parse optional weeklyOutlook (max 8 entries)
    _, _, _, hours_per_week, _ = normalized_inputs(payload)
    fallback_minutes = hours_per_week * 60
    raw_outlook = candidate.get("weeklyOutlook")
    if isinstance(raw_outlook, list) and len(raw_outlook) > 0:
        outlook: List[Dict[str, Any]] = []
        for entry in raw_outlook[:8]:
            if not isinstance(entry, dict):
                continue
            week = entry.get("week")
            focus = str(entry.get("focus", "")).strip()
            milestone = str(entry.get("milestone", "")).strip()
            if not focus or not milestone:
                continue
            raw_minutes = entry.get("estimatedMinutes", fallback_minutes)
            try:
                minutes_val = clamp(float(raw_minutes), 15, 600)
            except (TypeError, ValueError):
                minutes_val = clamp(fallback_minutes, 15, 600)
            outlook.append({
                "week": int(week) if isinstance(week, (int, float)) else len(outlook) + 1,
                "focus": focus,
                "milestone": milestone,
                "estimatedMinutes": minutes_val,
            })
        if outlook:
            result["weeklyOutlook"] = outlook

    return result


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

def run_agent(payload: Dict[str, Any]) -> Dict[str, Any]:
    fallback = deterministic_plan(payload)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return fallback

    client = OpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL_READINESS_AGENT", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    tool_trace: List[Dict[str, Any]] = []

    # Pre-loop extraction so dispatchers can access shared context
    composite, breakdown, recommendations, hours_per_week, target_role = normalized_inputs(payload)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "rank_readiness_gaps",
                "description": "Ranks readiness components by severity using current breakdown scores.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "build_seed_plan",
                "description": (
                    "Returns context (components, budget, difficulty) the LLM uses to write its own task descriptions. "
                    "Does NOT return pre-written tasks."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "top_n": {"type": "integer", "minimum": 1, "maximum": 4},
                    },
                    "required": ["top_n"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_drill_templates",
                "description": "Returns 2-3 drill template strings for a given readiness component and difficulty level.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "component_key": {
                            "type": "string",
                            "enum": ["theory", "implementation", "execution", "communication"],
                        },
                        "difficulty": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"],
                        },
                    },
                    "required": ["component_key", "difficulty"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "score_plan",
                "description": "Validates a draft plan for budget compliance and coverage. Returns score 0-100.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sessions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "session": {"type": "string"},
                                    "focus": {"type": "string"},
                                    "task": {"type": "string"},
                                    "durationMinutes": {"type": "number"},
                                    "target": {"type": "string"},
                                },
                            },
                        }
                    },
                    "required": ["sessions"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "estimate_weeks_to_target",
                "description": "Estimates how many weeks to close a score gap for a component at the learner's hours/week.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "component_key": {
                            "type": "string",
                            "enum": ["theory", "implementation", "execution", "communication"],
                        },
                        "current_score": {"type": "number"},
                        "target_score": {"type": "number"},
                    },
                    "required": ["component_key", "current_score", "target_score"],
                    "additionalProperties": False,
                },
            },
        },
    ]

    prompts = build_prompts(payload)
    system_prompt = prompts["system"]
    user_prompt = prompts["user"]

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    for _ in range(12):
        response = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            response_format={"type": "json_object"},
        )
        msg = response.choices[0].message

        assistant_message: Dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    },
                }
                for call in msg.tool_calls
            ]

        messages.append(assistant_message)

        if msg.tool_calls:
            for call in msg.tool_calls:
                tool_name = call.function.name
                raw_args = call.function.arguments or "{}"
                try:
                    parsed_args = json.loads(raw_args)
                    if not isinstance(parsed_args, dict):
                        parsed_args = {}
                except Exception:
                    parsed_args = {}

                invoked_at = utc_now_iso()
                if tool_name == "rank_readiness_gaps":
                    try:
                        tool_result = tool_rank_gaps(payload)
                        status = "ok"
                    except Exception as tool_error:
                        tool_result = {"error": str(tool_error)}
                        status = "error"
                elif tool_name == "build_seed_plan":
                    try:
                        top_n = int(parsed_args.get("top_n", 3))
                        tool_result = tool_build_seed_plan(payload, top_n=top_n)
                        status = "ok"
                    except Exception as tool_error:
                        tool_result = {"error": str(tool_error)}
                        status = "error"
                elif tool_name == "get_drill_templates":
                    try:
                        component_key = str(parsed_args.get("component_key", "theory"))
                        difficulty = str(parsed_args.get("difficulty", "intermediate"))
                        tool_result = tool_get_drill_templates(component_key, difficulty, target_role)
                        status = "ok"
                    except Exception as tool_error:
                        tool_result = {"error": str(tool_error)}
                        status = "error"
                elif tool_name == "score_plan":
                    try:
                        sessions_arg = parsed_args.get("sessions", [])
                        tool_result = tool_score_plan(payload, sessions_arg)
                        status = "ok"
                    except Exception as tool_error:
                        tool_result = {"error": str(tool_error)}
                        status = "error"
                elif tool_name == "estimate_weeks_to_target":
                    try:
                        component_key = str(parsed_args.get("component_key", "theory"))
                        current_score = float(parsed_args.get("current_score", 50))
                        target_score = float(parsed_args.get("target_score", 75))
                        tool_result = tool_estimate_weeks_to_target(
                            component_key, current_score, target_score, hours_per_week
                        )
                        status = "ok"
                    except Exception as tool_error:
                        tool_result = {"error": str(tool_error)}
                        status = "error"
                else:
                    tool_result = {"error": f"Unknown tool: {tool_name}"}
                    status = "error"

                tool_trace.append(
                    {
                        "step": len(tool_trace) + 1,
                        "toolName": tool_name,
                        "arguments": parsed_args,
                        "outputSummary": summarize_tool_result(tool_name, tool_result),
                        "status": status,
                        "invokedAt": invoked_at,
                    }
                )

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": tool_name,
                        "content": json.dumps(tool_result),
                    }
                )
            continue

        try:
            parsed = json.loads(msg.content or "{}")
        except Exception:
            return {
                **fallback,
                "toolTrace": tool_trace,
                "fallbackReason": "Agent returned invalid JSON.",
            }
        if not isinstance(parsed, dict):
            return {
                **fallback,
                "toolTrace": tool_trace,
                "fallbackReason": "Agent returned non-object JSON.",
            }
        return sanitize_agent_output(parsed, fallback, tool_trace, payload)

    return {
        **fallback,
        "toolTrace": tool_trace,
        "fallbackReason": "Agent loop reached max iterations without final response.",
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def read_payload_from_sources(args: argparse.Namespace) -> str:
    if args.payload:
        return args.payload
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise ValueError("Expected payload JSON via --payload or stdin")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an agentic readiness study plan")
    parser.add_argument("--payload", type=str, default="", help="Input JSON payload")
    args = parser.parse_args()

    try:
        raw_payload = read_payload_from_sources(args)
        payload = parse_payload(raw_payload)
        include_prompt = bool(payload.get("includePrompt"))
        result = run_agent(payload)
        if include_prompt and isinstance(result, dict):
            result["prompt"] = build_prompts(payload)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

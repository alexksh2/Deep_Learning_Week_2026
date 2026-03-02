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


def tool_rank_gaps(payload: Dict[str, Any]) -> Dict[str, Any]:
    _, breakdown, _, _, _ = normalized_inputs(payload)
    ranked = sort_gaps(breakdown)
    return {"ranked": ranked[:4]}


def tool_build_seed_plan(payload: Dict[str, Any], top_n: int = 3) -> Dict[str, Any]:
    _, breakdown, recommendations, hours_per_week, _ = normalized_inputs(payload)
    ranked = sort_gaps(breakdown)[: max(1, min(top_n, 4))]
    budget = hours_per_week * 60
    per_session = max(20, int(round(budget / (len(ranked) + 1))))

    sessions = []
    for idx, component in enumerate(ranked):
        linked = next((rec for rec in recommendations if map_rec_to_component(component["key"], rec)), None)
        sessions.append(
            {
                "session": f"Session {idx + 1}",
                "focus": component["label"],
                "task": linked["title"] if linked and linked.get("title") else fallback_task_for(component["key"]),
                "durationMinutes": clamp(linked["estimatedMinutes"] if linked else per_session, 15, 90),
                "target": f"Reduce {component['label']} gap by at least 8 points.",
            }
        )
    return {"sessions": sessions, "budgetMinutes": budget}


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
        sessions = tool_result.get("sessions", [])
        budget = tool_result.get("budgetMinutes", "?")
        count = len(sessions) if isinstance(sessions, list) else 0
        return f"Built seed plan with {count} sessions and {budget} minute budget."
    if "error" in tool_result:
        return f"Tool error: {tool_result.get('error')}"
    return "Tool executed."


def sanitize_agent_output(
    candidate: Dict[str, Any],
    fallback: Dict[str, Any],
    tool_trace: List[Dict[str, Any]],
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

    return {
        "plan": cleaned,
        "weeklyMinutes": weekly_minutes,
        "rationale": rationale,
        "source": "agent",
        "toolTrace": tool_trace,
        "generatedAt": utc_now_iso(),
    }


def build_prompts(payload: Dict[str, Any]) -> Dict[str, str]:
    system_prompt = (
        "You are an agentic quant-learning coach. Use tools first, then return compact JSON only. "
        "No markdown. Build a practical weekly plan with clear targets from weakest readiness components."
    )
    user_prompt = json.dumps(
        {
            "objective": "Generate AI readiness study plan",
            "constraints": {
                "maxSessions": 6,
                "minSessionMinutes": 15,
                "maxSessionMinutes": 90,
            },
            "input": payload,
            "outputSchema": {
                "plan": [
                    {
                        "session": "Session 1",
                        "focus": "Execution Discipline",
                        "task": "Specific task",
                        "durationMinutes": 30,
                        "target": "Measurable target",
                    }
                ],
                "rationale": "Short rationale",
            },
        }
    )
    return {"system": system_prompt, "user": user_prompt}


def run_agent(payload: Dict[str, Any]) -> Dict[str, Any]:
    fallback = deterministic_plan(payload)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return fallback

    client = OpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL_READINESS_AGENT", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    tool_trace: List[Dict[str, Any]] = []

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
                "description": "Builds a deterministic seed plan from weakest components and recommended actions.",
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
    ]

    prompts = build_prompts(payload)
    system_prompt = prompts["system"]
    user_prompt = prompts["user"]

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    for _ in range(6):
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
        return sanitize_agent_output(parsed, fallback, tool_trace)

    return {
        **fallback,
        "toolTrace": tool_trace,
        "fallbackReason": "Agent loop reached max iterations without final response.",
    }


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

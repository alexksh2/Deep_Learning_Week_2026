"""
interview_llm.py
================
LLM subprocess for the QLOS Interview Pipeline.

Sends the full conversation history to OpenAI and returns the next response.
The LLM conducts the interview autonomously — it decides what to ask and
when to give feedback based on the conversation so far.

Usage
-----
python3 interview_llm.py \
    --interviewer "Jane Street" \
    --category "Probability Brainteasers" \
    --total 5 \
    --context_block "=== CANDIDATE CONTEXT ===" \
    --messages '[{"role":"user","content":"start"},{"role":"assistant","content":"..."}]'

Output (stdout) — single JSON line
-----------------------------------
{
  "content": "...",          -- LLM response text
  "type": "question"|"feedback",  -- detected response type
  "score": 4 | null,         -- parsed score (feedback only)
  "hm_scoring": {            -- firm-specific hiring-manager scoring (feedback only)
    "firm": "Jane Street",
    "priorities": [
      {"dimension": "...", "weight": 0.35, "score": 4.0, "reason": "..."},
      ...
    ],
    "weighted_score": 4.1,
    "inferred": false
  } | null
}

All diagnostic output goes to stderr.
"""

from __future__ import annotations

import argparse
import ast
import json
import operator
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from openai import OpenAI

# ---------------------------------------------------------------------------
# Load env
# ---------------------------------------------------------------------------
for _candidate in [
    Path(__file__).parent.parent.parent / ".env.local",
    Path(__file__).parent.parent.parent / ".env",
]:
    if _candidate.exists():
        load_dotenv(_candidate)
        break

# ---------------------------------------------------------------------------
# System prompt — LLM runs the interview autonomously
# ---------------------------------------------------------------------------

DEFAULT_INTERVIEWER = "Jane Street"

_INTERVIEWER_ALIASES = {
    "jane street": "Jane Street",
    "jane st": "Jane Street",
    "citadel": "Citadel",
    "citadel securities": "Citadel",
    "two sigma": "Two Sigma",
    "two sigma investments": "Two Sigma",
    "d.e. shaw": "D.E. Shaw",
    "de shaw": "D.E. Shaw",
    "deshaw": "D.E. Shaw",
    "hrt": "HRT",
    "hudson river trading": "HRT",
    "sig": "SIG",
    "susquehanna": "SIG",
}

_FIRM_STYLE_GUIDES = {
    "Jane Street": (
        "INTERVIEW STYLE FOR JANE STREET:\n"
        "- Use compact, puzzle-like questions with explicit assumptions.\n"
        "- Prioritize first-principles reasoning and precise arithmetic.\n"
        "- Challenge vague answers with sharp follow-up probes.\n"
        "- Ask for sanity checks and alternate solution paths when relevant."
    ),
    "Citadel": (
        "INTERVIEW STYLE FOR CITADEL:\n"
        "- Keep questions direct and performance-oriented.\n"
        "- Emphasize trade-offs: alpha, risk, execution quality, and robustness.\n"
        "- Escalate difficulty quickly after strong answers.\n"
        "- Expect concise responses with measurable impact."
    ),
    "Two Sigma": (
        "INTERVIEW STYLE FOR TWO SIGMA:\n"
        "- Focus on data-centric and method-driven questioning.\n"
        "- Probe experimental design, validation strategy, and statistical rigor.\n"
        "- Test awareness of leakage, overfitting, and out-of-sample behavior.\n"
        "- Ask candidates to compare alternatives and justify model choices."
    ),
    "D.E. Shaw": (
        "INTERVIEW STYLE FOR D.E. SHAW:\n"
        "- Blend mathematical depth with algorithmic precision.\n"
        "- Probe edge cases, complexity, and implementation correctness.\n"
        "- Push for clear derivations rather than memorized formulas.\n"
        "- Expect careful reasoning with structured, concise explanations."
    ),
}

_HM_PRIORITY_PROFILES: Dict[str, List[Tuple[str, float, str]]] = {
    "Citadel": [
        ("Delivery & ownership", 0.30, "Ability to ship quickly with accountability."),
        ("Performance-minded engineering", 0.30, "Latency, robustness, and measurable system impact."),
        ("Execution under pressure", 0.20, "Composure and quality in time-constrained scenarios."),
        ("Decision quality with incomplete data", 0.20, "Pragmatic trade-offs under uncertainty."),
    ],
    "Jane Street": [
        ("Quality of reasoning", 0.35, "Clear first-principles problem solving."),
        ("Collaborative problem solving", 0.25, "Works through problems constructively with the interviewer."),
        ("Coachability & humility", 0.20, "Adapts to feedback and updates reasoning."),
        ("Communication clarity", 0.20, "Concise, precise articulation of assumptions and steps."),
    ],
    "Two Sigma": [
        ("Statistical/experimental rigor", 0.30, "Grounded model and validation reasoning."),
        ("Production engineering discipline", 0.25, "Code quality, testing, and reliability mindset."),
        ("Trade-off judgment", 0.25, "Balanced decisions across correctness, speed, and maintainability."),
        ("Cross-functional execution", 0.20, "Ability to align with stakeholders and deliver outcomes."),
    ],
    "D.E. Shaw": [
        ("Structured fundamentals", 0.30, "Strong core technical and mathematical grounding."),
        ("Long-horizon code quality", 0.25, "Sustainable implementation choices."),
        ("Communication precision", 0.25, "Careful, unambiguous explanations."),
        ("Technical-business judgment", 0.20, "Decisions that reflect both engineering and business context."),
    ],
    "HRT": [
        ("Systems/performance depth", 0.35, "Low-latency and systems-level competence."),
        ("Debugging in complex environments", 0.25, "Diagnoses hard issues methodically."),
        ("Low-level technical judgment", 0.20, "Sound choices in constrained systems contexts."),
        ("Independent execution", 0.20, "Can drive solutions with minimal guidance."),
    ],
    "SIG": [
        ("Decision quality under uncertainty", 0.30, "Pragmatic calls with incomplete information."),
        ("Teamwork", 0.25, "Effective collaboration with interviewers and peers."),
        ("Reliable implementation", 0.25, "Consistency, correctness, and follow-through."),
        ("Commercial awareness", 0.20, "Reasoning tied to market/business outcomes."),
    ],
}

_DEFAULT_HM_PRIORITY_PROFILE: List[Tuple[str, float, str]] = [
    ("Ownership", 0.25, "Takes responsibility for outcomes."),
    ("Technical execution", 0.30, "Implements correct and reliable solutions."),
    ("Decision quality", 0.25, "Makes grounded trade-offs."),
    ("Communication", 0.20, "Explains reasoning clearly."),
]


def interviewer_style_guide(interviewer: str) -> str:
    if interviewer in _FIRM_STYLE_GUIDES:
        return _FIRM_STYLE_GUIDES[interviewer]
    return (
        "INTERVIEW STYLE:\n"
        "- Ask technically rigorous questions aligned to the selected category.\n"
        "- Use clear, direct wording and progressively harder follow-ups.\n"
        "- Prioritize precise reasoning over generic, high-level answers."
    )


def hm_priority_profile(interviewer: str) -> List[Tuple[str, float, str]]:
    return list(_HM_PRIORITY_PROFILES.get(interviewer, _DEFAULT_HM_PRIORITY_PROFILE))


def hm_profile_prompt(interviewer: str) -> str:
    lines = []
    for dimension, weight, rationale in hm_priority_profile(interviewer):
        lines.append(f"- {dimension}: weight {weight:.2f}. {rationale}")
    return "\n".join(lines)


def build_system(interviewer: str, category: str, total: int, context_block: str) -> str:
    extra_rules = ""
    if "mental math" in category.lower():
        extra_rules = """
MENTAL MATH SCORING RULES:
- Compute the numeric ground truth before assigning a score.
- If the candidate's final numeric answer matches the ground truth (allowing normal rounding), score it 5/5.
- Do not label an answer incorrect if your own arithmetic reaches the same final number."""
    firm_style = interviewer_style_guide(interviewer)
    hm_profile = hm_profile_prompt(interviewer)

    return f"""You are a senior quant interviewer at {interviewer}.
You are conducting a {total}-question mock technical interview in the category: "{category}".

{context_block}

HOW TO CONDUCT THE INTERVIEW:
- When the candidate says "start" or you are asked to begin: ask your first question. Output ONLY the question — no preamble.
- After the candidate answers: evaluate their response using EXACTLY this format:
  **Score: [1-5]/5**
  **Scoring Breakdown:** Accuracy [0-3], Method [0-1], Clarity [0-1], Total [1-5]/5
  **Hiring Manager Lens ({interviewer}):**
  - [Priority 1 from HM profile]: [1-5]/5 (weight [0.xx]) - [one-sentence reason tied to this answer]
  - [Priority 2 from HM profile]: [1-5]/5 (weight [0.xx]) - [one-sentence reason tied to this answer]
  - [Priority 3 from HM profile]: [1-5]/5 (weight [0.xx]) - [one-sentence reason tied to this answer]
  - [Priority 4 from HM profile]: [1-5]/5 (weight [0.xx]) - [one-sentence reason tied to this answer]
  **HM Weighted Score:** [1.0-5.0]/5
  **Feedback:** [2-3 sentences — what was correct, what was missing, specific corrections]
  **Model Answer:** [Ideal 2-4 sentence answer]
  Then immediately ask your next question on a new line.
- Create your own questions freely. Make them realistic interview caliber. Vary difficulty and angle as the interview progresses.
- Adapt follow-up question depth based on how the candidate is performing — push harder on strong answers, go back to basics on weak ones.
- After question {total} is answered and evaluated, end with: "That concludes our session." — do not ask more questions.
- Be professional and direct. No filler phrases.
- Use this hiring-manager priority profile for differentiated scoring and reasons:
{hm_profile}
- The HM weighted score must be the weighted average of the four priority scores above.
- Keep the scoring format constant across firms, but adapt question style and follow-up behavior based on this firm profile:
{firm_style}
{extra_rules}"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        print(json.dumps({"error": "OPENAI_API_KEY not set"}))
        sys.exit(1)
    return OpenAI(api_key=key)


def parse_score(text: str) -> Optional[int]:
    m = re.search(r"\*\*Score:\s*([1-5])\/5\*\*", text)
    return int(m.group(1)) if m else None


def detect_type(text: str) -> str:
    """Heuristic: feedback always contains the Score marker."""
    return "feedback" if "**Score:" in text else "question"


def normalize_interviewer(name: str) -> str:
    key = (name or "").strip().lower()
    if not key:
        return DEFAULT_INTERVIEWER
    if key in _INTERVIEWER_ALIASES:
        return _INTERVIEWER_ALIASES[key]
    for alias, canonical in _INTERVIEWER_ALIASES.items():
        if alias in key:
            return canonical
    return (name or "").strip() or DEFAULT_INTERVIEWER


def default_scoring_breakdown(score: int) -> str:
    mapping = {
        5: (3, 1, 1),
        4: (2, 1, 1),
        3: (2, 1, 0),
        2: (1, 1, 0),
        1: (1, 0, 0),
    }
    accuracy, method, clarity = mapping.get(score, (1, 0, 0))
    return (
        f"**Scoring Breakdown:** Accuracy {accuracy}/3, "
        f"Method {method}/1, Clarity {clarity}/1, Total {score}/5"
    )


def ensure_scoring_breakdown(content: str) -> str:
    if detect_type(content) != "feedback":
        return content
    if re.search(r"\*\*Scoring Breakdown:\*\*", content, flags=re.IGNORECASE):
        return content

    score = parse_score(content)
    if score is None:
        return content

    breakdown = default_scoring_breakdown(score)
    return re.sub(
        r"(\*\*Score:\s*[1-5]\/5\*\*)",
        r"\1\n" + breakdown,
        content,
        count=1,
    )


def _normalize_dimension_label(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (label or "").lower()).strip()


def parse_hm_weighted_score(text: str) -> Optional[float]:
    m = re.search(r"\*\*HM Weighted Score:\*\*\s*([1-5](?:\.\d+)?)\s*\/\s*5", text, flags=re.IGNORECASE)
    if not m:
        return None
    try:
        value = float(m.group(1))
    except ValueError:
        return None
    return max(1.0, min(5.0, value))


def _default_hm_reason(score: int, dimension: str) -> str:
    if score >= 4:
        return f"Strong signal on {dimension.lower()} based on the response quality."
    if score == 3:
        return f"Meets baseline for {dimension.lower()}, but depth can improve."
    return f"Weak signal on {dimension.lower()} in this answer."


def ensure_hm_scoring(content: str, interviewer: str) -> str:
    if detect_type(content) != "feedback":
        return content
    if re.search(r"\*\*HM Weighted Score:\*\*", content, flags=re.IGNORECASE):
        return content

    score = parse_score(content)
    if score is None:
        return content

    profile = hm_priority_profile(interviewer)
    lines = [f"**Hiring Manager Lens ({interviewer}):**"]
    for dimension, weight, _ in profile:
        lines.append(
            f"- {dimension}: {score}/5 (weight {weight:.2f}) - {_default_hm_reason(score, dimension)}"
        )
    lines.append(f"**HM Weighted Score:** {float(score):.1f}/5")
    hm_block = "\n".join(lines)

    if re.search(r"\*\*Feedback:\*\*", content, flags=re.IGNORECASE):
        return re.sub(
            r"(\*\*Feedback:\*\*)",
            lambda m: hm_block + "\n" + m.group(1),
            content,
            count=1,
            flags=re.IGNORECASE,
        )
    return content.rstrip() + "\n\n" + hm_block


def parse_hm_scoring(content: str, interviewer: str) -> Optional[Dict[str, Any]]:
    if detect_type(content) != "feedback":
        return None

    profile = hm_priority_profile(interviewer)
    line_re = re.compile(
        r"^\s*-\s*(.+?):\s*([1-5](?:\.\d+)?)\s*/\s*5"
        r"(?:\s*\(weight\s*([01](?:\.\d+)?)\))?"
        r"\s*(?:[-\u2012-\u2015]\s*(.+))?\s*$",
        flags=re.IGNORECASE,
    )

    extracted_by_key: Dict[str, Dict[str, Any]] = {}
    extracted_in_order: List[Dict[str, Any]] = []
    for raw_line in (content or "").splitlines():
        line = raw_line.strip()
        m = line_re.match(line)
        if not m:
            continue
        label = m.group(1).strip()
        score_s = m.group(2)
        reason = (m.group(4) or "").strip()
        try:
            score_val = float(score_s)
        except ValueError:
            continue
        entry = {"label": label, "score": max(1.0, min(5.0, score_val)), "reason": reason}
        extracted_in_order.append(entry)
        key = _normalize_dimension_label(label)
        if key not in extracted_by_key:
            extracted_by_key[key] = entry

    overall = parse_score(content)
    inferred = False
    priorities: List[Dict[str, Any]] = []

    for i, (dimension, weight, _) in enumerate(profile):
        key = _normalize_dimension_label(dimension)
        entry = extracted_by_key.get(key)
        if entry is None and i < len(extracted_in_order):
            entry = extracted_in_order[i]

        if entry is None:
            inferred = True
            fallback = float(overall) if overall is not None else 3.0
            score_val = max(1.0, min(5.0, fallback))
            reason = "Inferred from overall score because this HM priority score was missing."
        else:
            score_val = float(entry["score"])
            reason = entry["reason"] or "No explicit reason provided."

        priorities.append({
            "dimension": dimension,
            "weight": round(weight, 2),
            "score": round(score_val, 2),
            "reason": reason,
        })

    weighted = parse_hm_weighted_score(content)
    if weighted is None:
        inferred = True
        total_weight = sum(item["weight"] for item in priorities)
        weighted = (
            sum(item["score"] * item["weight"] for item in priorities) / total_weight
            if total_weight > 0
            else 0.0
        )

    return {
        "firm": interviewer,
        "priorities": priorities,
        "weighted_score": round(float(weighted), 2),
        "inferred": inferred,
    }


_ALLOWED_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}
_ALLOWED_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def eval_simple_expr(expr: str) -> Optional[float]:
    """Safely evaluate a basic arithmetic expression."""
    try:
        node = ast.parse(expr, mode="eval")
    except SyntaxError:
        return None

    def _eval(n: ast.AST) -> float:
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.UnaryOp) and type(n.op) in _ALLOWED_UNARY_OPS:
            return _ALLOWED_UNARY_OPS[type(n.op)](_eval(n.operand))
        if isinstance(n, ast.BinOp) and type(n.op) in _ALLOWED_BIN_OPS:
            right = _eval(n.right)
            if isinstance(n.op, ast.Div) and abs(right) < 1e-12:
                raise ZeroDivisionError("division by zero")
            return _ALLOWED_BIN_OPS[type(n.op)](_eval(n.left), right)
        raise ValueError(f"Unsupported expression node: {type(n).__name__}")

    try:
        return _eval(node.body)
    except Exception:
        return None


def format_number(value: float) -> str:
    rounded = round(value)
    if abs(value - rounded) < 1e-9:
        return str(int(rounded))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def extract_last_number(text: str) -> Optional[float]:
    # Supports decimals, commas, and simple fractions like "3/4".
    matches = re.findall(r"-?\d+(?:,\d{3})*(?:\.\d+)?(?:/\d+(?:\.\d+)?)?", text or "")
    for token in reversed(matches):
        clean = token.replace(",", "")
        try:
            if "/" in clean:
                num_s, den_s = clean.split("/", 1)
                den = float(den_s)
                if abs(den) < 1e-12:
                    continue
                return float(num_s) / den
            return float(clean)
        except ValueError:
            continue
    return None


def latest_user_answer(messages: List[Dict[str, str]]) -> Optional[str]:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = (msg.get("content") or "").strip()
            if content and content.lower() != "start":
                return content
    return None


def extract_last_question(text: str) -> Optional[str]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for line in reversed(lines):
        if line.endswith("?"):
            return line
    chunks = re.findall(r"([^?]*\?)", text or "", flags=re.S)
    if chunks:
        return chunks[-1].strip()
    return None


def latest_asked_question(messages: List[Dict[str, str]]) -> Optional[str]:
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            question = extract_last_question(msg.get("content") or "")
            if question:
                return question
    return None


def extract_model_answer_value(content: str) -> Optional[float]:
    lines = (content or "").splitlines()
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not re.match(r"^\*\*Model Answer:\*\*", line, flags=re.IGNORECASE):
            continue

        # Capture inline model-answer text plus subsequent plain lines until a separator.
        text = re.sub(r"^\*\*Model Answer:\*\*\s*", "", line, flags=re.IGNORECASE).strip()
        for follow in lines[i + 1:]:
            stripped = follow.strip()
            if not stripped:
                break
            if stripped.startswith("**"):
                break
            if stripped.endswith("?"):
                break
            text = f"{text} {stripped}".strip()

        value = extract_last_number(text)
        if value is not None:
            return value

    return None


def solve_mental_math_question(question: str) -> Optional[float]:
    q = re.sub(r"\s+", " ", (question or "").lower().replace(",", "")).strip()
    if not q:
        return None

    # e.g. "What is 25% of 360?"
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%\s+of\s+(-?\d+(?:\.\d+)?)", q)
    if m:
        return (float(m.group(1)) / 100.0) * float(m.group(2))

    # e.g. "What is the square root of 144?"
    m = re.search(r"square root of\s+(-?\d+(?:\.\d+)?)", q)
    if m:
        value = float(m.group(1))
        if value < 0:
            return None
        return value ** 0.5

    # e.g. "If you have 3 apples and you buy 5 more, how many apples ...?"
    m = re.search(r"have\s+(-?\d+(?:\.\d+)?).+?\bbuy\s+(-?\d+(?:\.\d+)?)\s+more", q)
    if m:
        return float(m.group(1)) + float(m.group(2))

    # e.g. "A $50 item has a 20% discount. What is the final price?"
    percentage_change_patterns = [
        r"(?:\$|usd\s*)?(-?\d+(?:\.\d+)?)\b[^?]*?(-?\d+(?:\.\d+)?)\s*%\s*(discount|off|decrease|drop|reduction|down|tax|tip|markup|increase|rise|up)",
        r"(-?\d+(?:\.\d+)?)\s*%\s*(discount|off|decrease|drop|reduction|down|tax|tip|markup|increase|rise|up)[^?]*?(?:\$|usd\s*)?(-?\d+(?:\.\d+)?)",
    ]
    for idx, pattern in enumerate(percentage_change_patterns):
        m = re.search(pattern, q)
        if not m:
            continue

        if idx == 0:
            base = float(m.group(1))
            pct = float(m.group(2)) / 100.0
            keyword = m.group(3)
        else:
            pct = float(m.group(1)) / 100.0
            keyword = m.group(2)
            base = float(m.group(3))

        asks_final_value = bool(re.search(
            r"\b(final|new)\s+(price|cost|value|amount)\b|\b(after|remaining)\b",
            q,
        ))
        asks_delta = bool(re.search(
            r"\bdiscount\s+amount\b|\bamount\s+of\s+(discount|increase|tax|tip)\b|"
            r"\bhow\s+much\s+(is|would\s+be)\s+the\s+(discount|increase|tax|tip)\b",
            q,
        ))
        is_decrease = keyword in {"discount", "off", "decrease", "drop", "reduction", "down"}

        if asks_delta and not asks_final_value:
            return base * pct
        if asks_final_value:
            return base * (1.0 - pct if is_decrease else 1.0 + pct)

    expr = q
    expr = re.sub(r"^(what is|calculate|compute|evaluate)\s+", "", expr)
    expr = expr.replace("?", " ")

    replacements = [
        ("multiplied by", "*"),
        ("times", "*"),
        ("x", "*"),
        ("divided by", "/"),
        ("over", "/"),
        ("plus", "+"),
        ("minus", "-"),
        ("added to", "+"),
        ("subtracted from", "-"),
    ]
    for src, dst in replacements:
        expr = expr.replace(src, f" {dst} ")

    # Convert literal percentages to decimal multipliers.
    expr = re.sub(r"(-?\d+(?:\.\d+)?)\s*%", lambda m: str(float(m.group(1)) / 100.0), expr)
    expr = re.sub(r"[^0-9+\-*/(). ]", " ", expr)
    expr = re.sub(r"\s+", " ", expr).strip()
    if not expr or not re.search(r"\d", expr):
        return None

    return eval_simple_expr(expr)


def normalize_mental_math_feedback(
    category: str,
    messages: List[Dict[str, str]],
    content: str,
) -> str:
    if "mental math" not in category.lower() or detect_type(content) != "feedback":
        return content

    question = latest_asked_question(messages)
    user_answer = latest_user_answer(messages)
    if not question or not user_answer:
        return content

    candidate_value = extract_last_number(user_answer)
    if candidate_value is None:
        return content

    expected = solve_mental_math_question(question)
    expected_source = "question"
    if expected is None:
        expected = extract_model_answer_value(content)
        expected_source = "model-answer"
    if expected is None:
        return content

    tolerance = max(1e-9, 1e-4 * max(1.0, abs(expected)))
    is_correct = abs(candidate_value - expected) <= tolerance

    parsed_score = parse_score(content)
    looks_incorrect = bool(re.search(
        r"\bincorrect\b|\bnot\s+correct\b|\bmiscalculated\b|\barithmetic appears to have been confused\b",
        content,
        flags=re.IGNORECASE,
    ))

    # Guardrail for false negatives: if numeric answer is correct, force score/feedback consistency.
    if is_correct and ((parsed_score is not None and parsed_score < 5) or looks_incorrect):
        next_question = extract_last_question(content)
        expected_str = format_number(expected)
        corrected = (
            "**Score: 5/5**\n"
            "**Scoring Breakdown:** Accuracy 3/3, Method 1/1, Clarity 1/1, Total 5/5\n"
            f"**Feedback:** Correct. Your final answer is right ({expected_str}). "
            "The arithmetic checks out.\n"
            f"**Model Answer:** The correct result is {expected_str}."
        )
        if next_question and "that concludes our session" not in content.lower():
            corrected += f"\n\n{next_question}"

        print(
            f"[mental-math-guard] corrected false negative "
            f"(source={expected_source}, question={question!r}, "
            f"expected={expected_str}, user={format_number(candidate_value)})",
            file=sys.stderr,
        )
        return corrected

    return content


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="QLOS Interview LLM")
    parser.add_argument("--interviewer",  default="Jane Street")
    parser.add_argument("--category",      default="Probability Brainteasers")
    parser.add_argument("--total",         type=int, default=5)
    parser.add_argument("--context_block", default="")
    parser.add_argument("--messages",      default="[]", help="JSON array of {role, content}")
    args = parser.parse_args()

    try:
        messages: List[Dict[str, str]] = json.loads(args.messages)
    except json.JSONDecodeError:
        messages = []

    interviewer = normalize_interviewer(args.interviewer)
    client = get_client()
    system = build_system(interviewer, args.category, args.total, args.context_block)

    print("Calling OpenAI...", file=sys.stderr)
    model = os.getenv("OPENAI_MODEL_INTERVIEW", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}] + messages,
        max_tokens=600,
        temperature=0.2,
    )
    content = (resp.choices[0].message.content or "").strip()
    content = normalize_mental_math_feedback(args.category, messages, content)
    content = ensure_scoring_breakdown(content)
    had_hm_weighted = bool(re.search(r"\*\*HM Weighted Score:\*\*", content, flags=re.IGNORECASE))
    content = ensure_hm_scoring(content, interviewer)
    hm_scoring = parse_hm_scoring(content, interviewer)
    if hm_scoring and not had_hm_weighted:
        hm_scoring["inferred"] = True

    print(json.dumps({
        "content": content,
        "type":    detect_type(content),
        "score":   parse_score(content),
        "hm_scoring": hm_scoring,
    }))


if __name__ == "__main__":
    main()

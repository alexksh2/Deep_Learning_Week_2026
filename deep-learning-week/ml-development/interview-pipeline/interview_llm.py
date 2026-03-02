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
    --category "Probability Brainteasers" \
    --total 5 \
    --context_block "=== CANDIDATE CONTEXT ===" \
    --messages '[{"role":"user","content":"start"},{"role":"assistant","content":"..."}]'

Output (stdout) — single JSON line
-----------------------------------
{
  "content": "...",          -- LLM response text
  "type": "question"|"feedback",  -- detected response type
  "score": 4 | null          -- parsed score (feedback only)
}

All diagnostic output goes to stderr.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

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

def build_system(category: str, total: int, context_block: str) -> str:
    return f"""You are a senior quant interviewer at Jane Street / Citadel / Two Sigma.
You are conducting a {total}-question mock technical interview in the category: "{category}".

{context_block}

HOW TO CONDUCT THE INTERVIEW:
- When the candidate says "start" or you are asked to begin: ask your first question. Output ONLY the question — no preamble.
- After the candidate answers: evaluate their response using EXACTLY this format:
  **Score: [1-5]/5**
  **Feedback:** [2-3 sentences — what was correct, what was missing, specific corrections]
  **Model Answer:** [Ideal 2-4 sentence answer]
  Then immediately ask your next question on a new line.
- Create your own questions freely. Make them realistic interview caliber. Vary difficulty and angle as the interview progresses.
- Adapt follow-up question depth based on how the candidate is performing — push harder on strong answers, go back to basics on weak ones.
- After question {total} is answered and evaluated, end with: "That concludes our session." — do not ask more questions.
- Be professional and direct. No filler phrases."""


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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="QLOS Interview LLM")
    parser.add_argument("--category",      default="Probability Brainteasers")
    parser.add_argument("--total",         type=int, default=5)
    parser.add_argument("--context_block", default="")
    parser.add_argument("--messages",      default="[]", help="JSON array of {role, content}")
    args = parser.parse_args()

    try:
        messages: List[Dict[str, str]] = json.loads(args.messages)
    except json.JSONDecodeError:
        messages = []

    client = get_client()
    system = build_system(args.category, args.total, args.context_block)

    print("Calling OpenAI...", file=sys.stderr)
    model = os.getenv("OPENAI_MODEL_INTERVIEW", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}] + messages,
        max_tokens=600,
        temperature=0.5,
    )
    content = (resp.choices[0].message.content or "").strip()

    print(json.dumps({
        "content": content,
        "type":    detect_type(content),
        "score":   parse_score(content),
    }))


if __name__ == "__main__":
    main()

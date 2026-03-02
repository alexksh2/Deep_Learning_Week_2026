"""
interview_context.py
====================
CLI subprocess for the QLOS Interview Pipeline.

Reads three data sources and produces a rich candidate context JSON blob
that is injected into the AI interviewer's system prompt.

Data sources
------------
--resume   PATH      Resume file (PDF / DOCX / TXT)
--profile  PATH      Profile export PDF (optional)
--trade    JSON_STR  Serialised trade/behavioral metrics JSON (optional)
--category STR       Interview category override (optional)

Output (stdout)
---------------
Single JSON object:
{
  "candidate_name": str | null,
  "target_role":    str | null,
  "target_firms":   [str],
  "skills":         [str],           -- confirmed quant skills
  "gaps":           [str],           -- skill gaps from assessment
  "quant_score":    int | null,      -- 1-10 resume quant score
  "trade_signals":  {...} | null,    -- raw behavioral metrics
  "suggested_categories": [str],     -- ranked interview categories
  "context_block":  str              -- ready-to-inject system prompt text
}

Usage
-----
python3 interview_context.py \
    --resume /path/to/resume.pdf \
    --profile /path/to/profile_export.pdf \
    --trade '{"composite":58,"stopLossDiscipline":40,"revengeTradeRisk":25,...}' \
    --category "Probability Brainteasers"

All diagnostic output goes to stderr. stdout is pure JSON.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pdfplumber
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env.local (Next.js style) so OPENAI_API_KEY is available
# ---------------------------------------------------------------------------
for _candidate in [
    Path(__file__).parent.parent.parent / ".env.local",
    Path(__file__).parent.parent.parent / ".env",
]:
    if _candidate.exists():
        load_dotenv(_candidate)
        break

# ---------------------------------------------------------------------------
# Optional imports — graceful fallback if not installed
# ---------------------------------------------------------------------------
try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False
    print("Warning: openai not installed — LLM parsing disabled, using text heuristics only.", file=sys.stderr)

try:
    from docx import Document as DocxDocument
    _DOCX_AVAILABLE = True
except ImportError:
    _DOCX_AVAILABLE = False


# ---------------------------------------------------------------------------
# Category → skill mapping (used for suggestion ranking)
# ---------------------------------------------------------------------------
CATEGORY_SKILLS: Dict[str, List[str]] = {
    "Probability Brainteasers": ["Probability Theory", "Statistics", "Linear Algebra"],
    "Mental Math":              ["Numerical Methods", "Statistics"],
    "Timed Coding (Python)":   ["Python", "Machine Learning", "Backtesting"],
    "Market Microstructure":   ["Market Microstructure", "Algorithmic Trading", "Signal Research"],
    "Statistics & ML":         ["Statistics", "Machine Learning", "Time Series Analysis", "Factor Models"],
    "Derivatives & Options":   ["Derivatives Pricing", "Options Greeks", "Volatility Modelling", "Stochastic Calculus"],
}

ROLE_CATEGORY_PRIORITY: Dict[str, List[str]] = {
    "Quant Research":   ["Probability Brainteasers", "Statistics & ML", "Timed Coding (Python)", "Market Microstructure"],
    "Quant Trading":    ["Market Microstructure", "Probability Brainteasers", "Derivatives & Options", "Mental Math"],
    "Quant Dev":        ["Timed Coding (Python)", "Market Microstructure", "Probability Brainteasers", "Mental Math"],
    "Risk":             ["Derivatives & Options", "Statistics & ML", "Probability Brainteasers", "Mental Math"],
    "Data Science":     ["Statistics & ML", "Timed Coding (Python)", "Probability Brainteasers", "Mental Math"],
}


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text_pdf(path: Path) -> str:
    parts: List[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


def extract_text_docx(path: Path) -> str:
    if not _DOCX_AVAILABLE:
        return ""
    doc = DocxDocument(str(path))
    return "\n".join(p.text for p in doc.paragraphs)


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_text_pdf(path)
    if ext in (".docx", ".doc"):
        return extract_text_docx(path)
    return path.read_text(encoding="utf-8", errors="ignore")


# ---------------------------------------------------------------------------
# OpenAI LLM helper
# ---------------------------------------------------------------------------

class OpenAILLM:
    def __init__(self, model: str = "gpt-4o-mini") -> None:
        self.model = model
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def generate(self, system: str, user: str, max_tokens: int = 1500) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=0.0,
        )
        return (resp.choices[0].message.content or "").strip()


def _extract_json(text: str) -> str:
    """Strip markdown fences and return first JSON object found."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1)
    m2 = re.search(r"(\{.*\})", text, re.DOTALL)
    if m2:
        return m2.group(1)
    return text


# ---------------------------------------------------------------------------
# Resume parsing
# ---------------------------------------------------------------------------

_RESUME_SYSTEM = (
    "You are a quant finance resume parser. "
    "Extract structured information and return ONLY a valid JSON object. "
    "No markdown fences, no commentary."
)

_RESUME_SCHEMA = """{
  "name": null,
  "target_role": null,
  "skills": [],
  "gaps": [],
  "strengths": [],
  "quant_score": 7,
  "quant_relevance": "2-3 sentence assessment"
}"""


def parse_resume(text: str, llm: OpenAILLM) -> Dict[str, Any]:
    user = (
        f"Return JSON matching EXACTLY:\n{_RESUME_SCHEMA}\n\n"
        "Rules:\n"
        "- skills: list of quant-relevant skills explicitly evidenced in the resume\n"
        "- gaps: important quant skills that are absent or weak\n"
        "- strengths: 3-5 specific candidate strengths\n"
        "- quant_score: integer 1-10\n\n"
        f"RESUME:\n{text[:6000]}"
    )
    raw = llm.generate(_RESUME_SYSTEM, user, max_tokens=1000)
    try:
        return json.loads(_extract_json(raw))
    except Exception:
        return {"name": None, "target_role": None, "skills": [], "gaps": [],
                "strengths": [], "quant_score": None, "quant_relevance": ""}


# ---------------------------------------------------------------------------
# Profile PDF parsing
# ---------------------------------------------------------------------------

_PROFILE_SYSTEM = (
    "You are extracting structured data from a quant finance learning platform profile export. "
    "Return ONLY a valid JSON object. No markdown, no commentary."
)

_PROFILE_SCHEMA = """{
  "name": null,
  "target_role": null,
  "target_firms": [],
  "tracks": [],
  "readiness_score": null,
  "theory_score": null,
  "execution_score": null,
  "skill_gaps": [],
  "north_star": null
}"""


def parse_profile(text: str, llm: OpenAILLM) -> Dict[str, Any]:
    user = (
        f"Return JSON matching EXACTLY:\n{_PROFILE_SCHEMA}\n\n"
        "Extract from this profile export. Use null for missing fields.\n\n"
        f"PROFILE TEXT:\n{text[:5000]}"
    )
    raw = llm.generate(_PROFILE_SYSTEM, user, max_tokens=600)
    try:
        return json.loads(_extract_json(raw))
    except Exception:
        return {"name": None, "target_role": None, "target_firms": [], "tracks": [],
                "readiness_score": None, "theory_score": None, "execution_score": None,
                "skill_gaps": [], "north_star": None}


# ---------------------------------------------------------------------------
# Heuristic fallback (no OpenAI) — simple keyword extraction from text
# ---------------------------------------------------------------------------

SKILL_KEYWORDS = [
    "Python", "C++", "R", "Julia", "MATLAB", "SQL",
    "Probability", "Statistics", "Stochastic Calculus", "Linear Algebra",
    "Numerical Methods", "Optimization", "Time Series",
    "Derivatives", "Options", "Greeks", "Volatility", "Fixed Income",
    "Portfolio", "Factor Models", "Machine Learning", "Deep Learning",
    "Market Microstructure", "Algorithmic Trading", "Backtesting",
    "Risk Management", "Bloomberg", "QuantLib",
]


def heuristic_skills(text: str) -> List[str]:
    found = []
    tl = text.lower()
    for kw in SKILL_KEYWORDS:
        if kw.lower() in tl:
            found.append(kw)
    return found


# ---------------------------------------------------------------------------
# Suggest interview categories from gaps + role + trade signals
# ---------------------------------------------------------------------------

def suggest_categories(
    gaps: List[str],
    target_role: Optional[str],
    trade_signals: Optional[Dict[str, Any]],
) -> List[str]:
    scores: Dict[str, float] = {cat: 0.0 for cat in CATEGORY_SKILLS}

    # Boost categories that cover the candidate's gaps
    gaps_lower = {g.lower() for g in gaps}
    for cat, skills in CATEGORY_SKILLS.items():
        for skill in skills:
            if skill.lower() in gaps_lower:
                scores[cat] += 2.0

    # Boost by role priority
    if target_role:
        role_key = None
        for k in ROLE_CATEGORY_PRIORITY:
            if k.lower() in (target_role or "").lower():
                role_key = k
                break
        if role_key:
            priority = ROLE_CATEGORY_PRIORITY[role_key]
            for i, cat in enumerate(priority):
                scores[cat] += (len(priority) - i) * 0.5

    # Boost weak trading areas into relevant categories
    if trade_signals:
        if trade_signals.get("stopLossDiscipline", 100) < 50:
            scores["Market Microstructure"] += 1.5
        if trade_signals.get("revengeTradeRisk", 0) > 40:
            scores["Market Microstructure"] += 1.0
        if trade_signals.get("composite", 100) < 50:
            scores["Derivatives & Options"] += 1.0

    return sorted(scores, key=lambda c: scores[c], reverse=True)


# ---------------------------------------------------------------------------
# Assemble the context block injected into the system prompt
# ---------------------------------------------------------------------------

def build_context_block(
    candidate_name: Optional[str],
    target_role: Optional[str],
    target_firms: List[str],
    skills: List[str],
    gaps: List[str],
    strengths: List[str],
    quant_score: Optional[int],
    quant_relevance: Optional[str],
    trade_signals: Optional[Dict[str, Any]],
    suggested_categories: List[str],
) -> str:
    lines: List[str] = ["=== CANDIDATE CONTEXT (personalise questions to this profile) ==="]

    if candidate_name:
        lines.append(f"Name: {candidate_name}")
    if target_role:
        lines.append(f"Target role: {target_role}")
    if target_firms:
        lines.append(f"Target firms: {', '.join(target_firms)}")

    if skills:
        lines.append(f"Confirmed skills: {', '.join(skills[:15])}")
    if gaps:
        lines.append(f"Skill gaps (probe these): {', '.join(gaps[:10])}")
    if strengths:
        lines.append(f"Strengths: {', '.join(strengths[:5])}")
    if quant_score is not None:
        lines.append(f"Resume quant score: {quant_score}/10")
    if quant_relevance:
        lines.append(f"Assessment: {quant_relevance}")

    if trade_signals:
        ts = trade_signals
        lines.append("Trading / behavioral signals:")
        if "composite" in ts:
            lines.append(f"  - Composite readiness: {ts['composite']}/100")
        if "stopLossDiscipline" in ts:
            lines.append(f"  - Stop-loss discipline: {ts['stopLossDiscipline']}/100"
                         + (" (weak — probe risk management depth)" if ts["stopLossDiscipline"] < 50 else ""))
        if "revengeTradeRisk" in ts:
            lines.append(f"  - Revenge trade risk: {ts['revengeTradeRisk']}/100"
                         + (" (elevated — probe emotional discipline)" if ts["revengeTradeRisk"] > 40 else ""))
        if "executionQuality" in ts:
            lines.append(f"  - Execution quality: {ts['executionQuality']}/100")
        if "riskDiscipline" in ts:
            lines.append(f"  - Risk discipline: {ts['riskDiscipline']}/100")
        if "explanation" in ts and ts["explanation"]:
            lines.append(f"  - Note: {ts['explanation']}")

    if suggested_categories:
        lines.append(f"Recommended focus categories: {', '.join(suggested_categories[:3])}")

    lines.append("=== END CONTEXT ===")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="QLOS Interview Context Builder")
    parser.add_argument("--resume",   help="Path to resume PDF / DOCX / TXT")
    parser.add_argument("--profile",  help="Path to profile export PDF")
    parser.add_argument("--trade",    help="JSON string of trade/behavioral metrics")
    parser.add_argument("--category", help="Interview category override")
    args = parser.parse_args()

    if not args.resume and not args.profile:
        print(json.dumps({"error": "At least --resume or --profile is required"}))
        sys.exit(1)

    # ── Parse trade signals ──────────────────────────────────────────────────
    trade_signals: Optional[Dict[str, Any]] = None
    if args.trade:
        try:
            trade_signals = json.loads(args.trade)
            print("Trade metrics loaded.", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"Warning: could not parse --trade JSON: {e}", file=sys.stderr)

    # ── Initialise LLM ───────────────────────────────────────────────────────
    llm: Optional[OpenAILLM] = None
    if _OPENAI_AVAILABLE and os.getenv("OPENAI_API_KEY"):
        llm = OpenAILLM(model=os.getenv("OPENAI_MODEL_CONTEXT", os.getenv("OPENAI_MODEL", "gpt-4o-mini")))
        print("OpenAI LLM ready.", file=sys.stderr)
    else:
        print("OpenAI unavailable — using heuristic extraction.", file=sys.stderr)

    # ── Resume ───────────────────────────────────────────────────────────────
    resume_data: Dict[str, Any] = {}
    if args.resume:
        rpath = Path(args.resume)
        if not rpath.exists():
            print(json.dumps({"error": f"Resume not found: {args.resume}"}))
            sys.exit(1)
        print(f"Reading resume: {rpath.name}", file=sys.stderr)
        resume_text = extract_text(rpath)
        if llm:
            resume_data = parse_resume(resume_text, llm)
        else:
            resume_data = {
                "name": None, "target_role": None,
                "skills": heuristic_skills(resume_text),
                "gaps": [], "strengths": [],
                "quant_score": None, "quant_relevance": "",
            }
        print("Resume parsed.", file=sys.stderr)

    # ── Profile PDF ──────────────────────────────────────────────────────────
    profile_data: Dict[str, Any] = {}
    if args.profile:
        ppath = Path(args.profile)
        if ppath.exists():
            print(f"Reading profile: {ppath.name}", file=sys.stderr)
            profile_text = extract_text(ppath)
            if llm:
                profile_data = parse_profile(profile_text, llm)
            print("Profile parsed.", file=sys.stderr)
        else:
            print(f"Warning: profile file not found: {args.profile}", file=sys.stderr)

    # ── Merge fields (profile overrides resume where richer) ─────────────────
    candidate_name  = profile_data.get("name")   or resume_data.get("name")
    target_role     = profile_data.get("target_role") or resume_data.get("target_role")
    target_firms    = profile_data.get("target_firms") or []
    skills          = resume_data.get("skills", [])
    gaps            = list({*resume_data.get("gaps", []), *profile_data.get("skill_gaps", [])})
    strengths       = resume_data.get("strengths", [])
    quant_score     = resume_data.get("quant_score")
    quant_relevance = resume_data.get("quant_relevance", "")

    # ── Suggest categories ───────────────────────────────────────────────────
    suggested = suggest_categories(gaps, target_role, trade_signals)
    if args.category:
        # Put the explicitly requested category first
        suggested = [args.category] + [c for c in suggested if c != args.category]

    # ── Build context block ──────────────────────────────────────────────────
    context_block = build_context_block(
        candidate_name, target_role, target_firms,
        skills, gaps, strengths, quant_score, quant_relevance,
        trade_signals, suggested,
    )

    # ── Output ───────────────────────────────────────────────────────────────
    output = {
        "candidate_name":        candidate_name,
        "target_role":           target_role,
        "target_firms":          target_firms,
        "skills":                skills,
        "gaps":                  gaps,
        "quant_score":           quant_score,
        "trade_signals":         trade_signals,
        "suggested_categories":  suggested,
        "context_block":         context_block,
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()

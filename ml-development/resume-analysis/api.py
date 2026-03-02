"""
Quant finance resume analyser — CLI subprocess.

Usage:
    pip install openai faiss-cpu sentence-transformers pdfplumber python-docx numpy python-dotenv
    python3 api.py --file /path/to/resume.pdf

Outputs a single JSON object to stdout. All diagnostic output goes to stderr.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import faiss
from dotenv import load_dotenv
from openai import OpenAI
from sentence_transformers import SentenceTransformer
import pdfplumber
from docx import Document
import io

# Load .env.local for standalone runs (subprocess inherits env from Next.js automatically)
for _candidate in [
    Path(__file__).parent.parent / ".env.local",
    Path(__file__).parent.parent / ".env",
]:
    if _candidate.exists():
        load_dotenv(_candidate)
        break


# ----------------------------
# 1) Quant Finance Taxonomy
# ----------------------------

@dataclass(frozen=True)
class SkillTaxonomyItem:
    canonical: str
    category: str
    aliases: Tuple[str, ...] = ()
    description: str = ""


def get_taxonomy() -> List[SkillTaxonomyItem]:
    return [
        # Programming
        SkillTaxonomyItem("Python", "Programming",
            ("py", "python3", "pandas", "numpy", "scipy"),
            "Python for quantitative analysis and data science"),
        SkillTaxonomyItem("C++", "Programming",
            ("cpp", "c plus plus", "low latency", "high performance c"),
            "C++ for high-performance and low-latency systems"),
        SkillTaxonomyItem("R", "Programming",
            ("r programming", "rstudio", "tidyverse", "r stats"),
            "R for statistical computing and econometrics"),
        SkillTaxonomyItem("MATLAB", "Programming",
            ("matlab simulink",),
            "MATLAB for numerical computing and financial modelling"),
        SkillTaxonomyItem("Julia", "Programming",
            ("julia lang",),
            "Julia for high-performance numerical computing"),
        SkillTaxonomyItem("SQL", "Programming",
            ("postgres", "mysql", "sqlite", "postgresql", "database queries"),
            "SQL for financial data retrieval"),
        SkillTaxonomyItem("Java", "Programming",
            ("j2ee", "jdk"),
            "Java for trading systems and financial infrastructure"),

        # Mathematics
        SkillTaxonomyItem("Stochastic Calculus", "Mathematics",
            ("ito calculus", "sde", "stochastic differential equations", "brownian motion",
             "ito's lemma", "wiener process", "martingale"),
            "Stochastic calculus for derivatives pricing"),
        SkillTaxonomyItem("Probability Theory", "Mathematics",
            ("measure theory", "probability", "random variables", "conditional expectation",
             "central limit theorem", "law of large numbers"),
            "Probability and measure theory"),
        SkillTaxonomyItem("Statistics", "Mathematics",
            ("statistical analysis", "hypothesis testing", "regression analysis",
             "bayesian statistics", "maximum likelihood", "econometrics"),
            "Applied statistics and econometrics"),
        SkillTaxonomyItem("Linear Algebra", "Mathematics",
            ("matrix algebra", "eigenvalues", "eigenvectors", "pca",
             "singular value decomposition", "svd"),
            "Linear algebra for portfolio and model construction"),
        SkillTaxonomyItem("Numerical Methods", "Mathematics",
            ("finite difference", "monte carlo simulation", "numerical integration",
             "binomial trees", "pde methods", "crank-nicolson"),
            "Numerical methods for derivatives pricing"),
        SkillTaxonomyItem("Optimization", "Mathematics",
            ("convex optimization", "linear programming", "quadratic programming",
             "lp", "qp", "mean-variance optimization", "lagrange multipliers"),
            "Mathematical optimization for portfolio construction"),
        SkillTaxonomyItem("Time Series Analysis", "Mathematics",
            ("arima", "garch", "var model", "cointegration", "autocorrelation",
             "kalman filter", "arch"),
            "Time series modelling for financial data"),

        # Derivatives & Pricing
        SkillTaxonomyItem("Derivatives Pricing", "Derivatives",
            ("black-scholes", "options pricing", "binomial model", "risk-neutral pricing",
             "martingale pricing", "pde pricing"),
            "Derivatives valuation and pricing models"),
        SkillTaxonomyItem("Options Greeks", "Derivatives",
            ("delta", "gamma", "vega", "theta", "rho", "greeks", "delta hedging"),
            "Options sensitivity analysis"),
        SkillTaxonomyItem("Volatility Modelling", "Derivatives",
            ("sabr", "heston model", "local volatility", "implied volatility",
             "vol surface", "stochastic volatility", "vix"),
            "Volatility surface construction and modelling"),
        SkillTaxonomyItem("Exotic Options", "Derivatives",
            ("barrier options", "asian options", "lookback options", "digital options",
             "structured products", "exotics"),
            "Exotic and structured derivatives"),
        SkillTaxonomyItem("Interest Rate Modelling", "Fixed Income",
            ("hull-white", "vasicek", "cir model", "libor market model", "hjm",
             "short rate model", "swap pricing"),
            "Interest rate models for fixed income"),

        # Fixed Income
        SkillTaxonomyItem("Fixed Income", "Fixed Income",
            ("bonds", "yield curve", "duration", "convexity", "dv01", "pvbp",
             "coupon bonds", "zero coupon", "treasury"),
            "Fixed income instruments and analysis"),
        SkillTaxonomyItem("Credit Risk", "Fixed Income",
            ("credit default swap", "cds", "credit modelling", "pd", "lgd",
             "credit spread", "structural model", "merton model"),
            "Credit risk modelling and instruments"),

        # Risk Management
        SkillTaxonomyItem("Risk Management", "Risk",
            ("var", "value at risk", "cvar", "expected shortfall", "stress testing",
             "scenario analysis", "risk metrics"),
            "Quantitative risk management"),
        SkillTaxonomyItem("Market Risk", "Risk",
            ("market risk", "sensitivities", "greeks pnl", "risk attribution",
             "frtb", "basel iii"),
            "Market risk measurement and regulation"),
        SkillTaxonomyItem("Counterparty Risk", "Risk",
            ("xva", "cva", "dva", "fva", "bilateral cva", "counterparty credit risk"),
            "Counterparty credit risk and XVA"),

        # Portfolio Management
        SkillTaxonomyItem("Portfolio Optimization", "Portfolio Management",
            ("markowitz", "mean-variance", "efficient frontier", "black-litterman",
             "maximum sharpe", "minimum variance"),
            "Portfolio construction and optimisation"),
        SkillTaxonomyItem("Factor Models", "Portfolio Management",
            ("fama-french", "capm", "apt", "multi-factor model", "alpha", "beta",
             "smart beta", "risk factors", "barra"),
            "Factor-based investing and risk models"),
        SkillTaxonomyItem("Asset Allocation", "Portfolio Management",
            ("strategic asset allocation", "tactical asset allocation", "rebalancing",
             "liability-driven investing", "ldi"),
            "Asset allocation frameworks"),
        SkillTaxonomyItem("Performance Attribution", "Portfolio Management",
            ("brinson attribution", "sharpe ratio", "information ratio", "tracking error",
             "alpha generation", "risk-adjusted return"),
            "Portfolio performance measurement"),

        # Algorithmic Trading
        SkillTaxonomyItem("Algorithmic Trading", "Trading",
            ("algo trading", "systematic trading", "execution algorithms", "twap", "vwap",
             "implementation shortfall", "smart order routing"),
            "Algorithmic and systematic trading"),
        SkillTaxonomyItem("Backtesting", "Trading",
            ("strategy backtesting", "walk-forward testing", "out-of-sample testing",
             "zipline", "backtrader", "vectorbt"),
            "Backtesting trading strategies"),
        SkillTaxonomyItem("Market Microstructure", "Trading",
            ("order book", "limit order book", "bid-ask spread", "market impact",
             "order flow", "adverse selection", "high frequency trading", "hft"),
            "Market microstructure and trading dynamics"),
        SkillTaxonomyItem("Signal Research", "Trading",
            ("alpha signals", "factor signals", "momentum", "mean reversion",
             "stat arb", "statistical arbitrage", "pairs trading"),
            "Quantitative signal and alpha research"),

        # ML/AI in Finance
        SkillTaxonomyItem("Machine Learning", "ML/AI",
            ("ml", "deep learning", "neural networks", "supervised learning",
             "unsupervised learning", "reinforcement learning"),
            "Machine learning techniques applied to finance"),
        SkillTaxonomyItem("NLP for Finance", "ML/AI",
            ("sentiment analysis", "text mining", "news analytics",
             "earnings call analysis", "nlp finance", "natural language processing"),
            "NLP for financial text analysis"),
        SkillTaxonomyItem("Reinforcement Learning", "ML/AI",
            ("rl", "q-learning", "dqn", "policy gradient", "trading agent"),
            "Reinforcement learning for trading and execution"),

        # Tools & Data
        SkillTaxonomyItem("Bloomberg", "Tools",
            ("bloomberg terminal", "bbg", "bloomberg api", "blp"),
            "Bloomberg terminal and data services"),
        SkillTaxonomyItem("QuantLib", "Tools",
            ("quantlib python", "ql"),
            "QuantLib for derivatives pricing and risk"),
        SkillTaxonomyItem("Excel/VBA", "Tools",
            ("excel", "vba", "spreadsheets", "macro", "xlwings"),
            "Excel and VBA for financial modelling"),
        SkillTaxonomyItem("Financial Data", "Tools",
            ("refinitiv", "reuters", "compustat", "crsp", "wrds", "quandl",
             "yfinance", "alpaca", "market data"),
            "Financial data sources and APIs"),

        # Domain
        SkillTaxonomyItem("Financial Modelling", "Finance",
            ("financial model", "dcf", "lbo", "three statement model", "valuation"),
            "Spreadsheet and analytical financial modelling"),
        SkillTaxonomyItem("Quantitative Research", "Finance",
            ("quantitative analysis", "quant research", "research paper", "white paper"),
            "Quantitative research methodology"),
        SkillTaxonomyItem("Communication", "Soft Skills",
            ("presentation", "public speaking", "stakeholder management"),
            "Communication skills"),
        SkillTaxonomyItem("Problem Solving", "Soft Skills",
            ("analytical thinking", "critical thinking", "first principles"),
            "Analytical problem solving"),
    ]


# ----------------------------
# 2) Career Profiles
# ----------------------------

CAREER_PROFILES = {
    "Quantitative Analyst": {
        "required": ["Python", "Stochastic Calculus", "Derivatives Pricing", "Statistics"],
        "preferred": ["C++", "Options Greeks", "Volatility Modelling", "Risk Management", "QuantLib", "MATLAB"],
        "category": "Quant"
    },
    "Quantitative Researcher": {
        "required": ["Python", "Statistics", "Machine Learning", "Factor Models"],
        "preferred": ["R", "Time Series Analysis", "Signal Research", "Backtesting", "Linear Algebra", "SQL"],
        "category": "Quant"
    },
    "Quantitative Developer": {
        "required": ["C++", "Python", "SQL"],
        "preferred": ["Algorithmic Trading", "Market Microstructure", "Java", "Numerical Methods", "Backtesting"],
        "category": "Engineering"
    },
    "Algorithmic Trader": {
        "required": ["Algorithmic Trading", "Backtesting", "Python"],
        "preferred": ["Market Microstructure", "Signal Research", "C++", "Statistics", "Machine Learning"],
        "category": "Trading"
    },
    "Derivatives Trader / Structurer": {
        "required": ["Derivatives Pricing", "Options Greeks", "Fixed Income"],
        "preferred": ["Volatility Modelling", "Interest Rate Modelling", "Exotic Options", "Stochastic Calculus", "Bloomberg"],
        "category": "Trading"
    },
    "Risk Manager (Quant)": {
        "required": ["Risk Management", "Statistics", "Python"],
        "preferred": ["Market Risk", "Counterparty Risk", "Time Series Analysis", "R", "Excel/VBA", "Bloomberg"],
        "category": "Risk"
    },
    "Portfolio Manager (Quant)": {
        "required": ["Portfolio Optimization", "Factor Models", "Statistics"],
        "preferred": ["Python", "Asset Allocation", "Performance Attribution", "Risk Management", "Machine Learning"],
        "category": "Portfolio Management"
    },
    "Fixed Income Quant": {
        "required": ["Fixed Income", "Interest Rate Modelling", "Stochastic Calculus"],
        "preferred": ["Credit Risk", "Numerical Methods", "Python", "C++", "QuantLib", "Bloomberg"],
        "category": "Quant"
    },
    "Credit Quant": {
        "required": ["Credit Risk", "Statistics", "Python"],
        "preferred": ["Counterparty Risk", "Fixed Income", "Stochastic Calculus", "Machine Learning", "R"],
        "category": "Quant"
    },
    "Data Scientist (Finance)": {
        "required": ["Python", "Machine Learning", "Statistics", "SQL"],
        "preferred": ["Time Series Analysis", "NLP for Finance", "Reinforcement Learning", "Financial Data", "Factor Models"],
        "category": "Data Science"
    },
    "Quant Strategist": {
        "required": ["Signal Research", "Backtesting", "Statistics"],
        "preferred": ["Python", "Factor Models", "Machine Learning", "Time Series Analysis", "Portfolio Optimization"],
        "category": "Quant"
    },
    "Financial Engineer": {
        "required": ["Derivatives Pricing", "Numerical Methods", "Python"],
        "preferred": ["C++", "Stochastic Calculus", "Volatility Modelling", "Interest Rate Modelling", "QuantLib", "MATLAB"],
        "category": "Quant"
    },
}


# ----------------------------
# 3) Shared helpers
# ----------------------------

NON_QUANT_CATEGORIES = {"Soft Skills"}

QUANT_KEY_TERMS = {
    "quant",
    "python",
    "c++",
    "sql",
    "stochastic",
    "statistics",
    "linear algebra",
    "derivatives",
    "options",
    "volatility",
    "risk",
    "factor",
    "portfolio",
    "backtesting",
    "algorithmic trading",
    "microstructure",
    "signal",
    "time series",
    "fixed income",
    "credit",
    "market data",
    "machine learning",
    "reinforcement learning",
    "quantlib",
    "bloomberg",
    "alpha",
    "beta",
    "sharpe",
    "var",
    "garch",
}


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_quant_category(category: Optional[str]) -> bool:
    if not category:
        return True
    return category not in NON_QUANT_CATEGORIES


def _is_quant_related_text(value: str) -> bool:
    lower = value.lower()
    if "quant" in lower:
        return True
    return any(term in lower for term in QUANT_KEY_TERMS)


def _trim_text(value: str, max_chars: int = 180) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 3].rstrip() + "..."


def _dedupe_strings(values: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(value.strip())
    return out


def build_skill_evidence_map(extraction: Dict[str, Any], max_per_skill: int = 3) -> Dict[str, List[str]]:
    evidence_by_skill: Dict[str, List[str]] = {}
    skills = extraction.get("skills", [])
    if not isinstance(skills, list):
        return evidence_by_skill

    for item in skills:
        if not isinstance(item, dict):
            continue
        skill = item.get("skill")
        if not isinstance(skill, str) or not skill.strip():
            continue
        key = skill.strip().lower()
        snippets = item.get("evidence", [])
        if not isinstance(snippets, list):
            continue
        bucket = evidence_by_skill.setdefault(key, [])
        for snippet in snippets:
            if not isinstance(snippet, str):
                continue
            cleaned = re.sub(r"\s+", " ", snippet).strip()
            if len(cleaned) < 10:
                continue
            if cleaned not in bucket:
                bucket.append(cleaned)
            if len(bucket) >= max_per_skill:
                break

    return evidence_by_skill


def _build_score_explanation(
    missing_required: List[str],
    missing_preferred: List[str],
) -> str:
    if missing_required:
        return (
            "Primary constraint: missing required skills "
            f"({', '.join(missing_required)}). Required skills have the highest weight."
        )
    if missing_preferred:
        return (
            "All required skills are covered; score is limited by missing preferred skills "
            f"({', '.join(missing_preferred)})."
        )
    return "All required and preferred skills are covered."


def _build_action_text(skill: str) -> str:
    lower = skill.lower()
    if any(term in lower for term in ["backtesting", "signal", "algorithmic trading", "microstructure"]):
        return (
            f"Add a project bullet showing {skill} with dataset, strategy logic, and out-of-sample metrics "
            "(e.g., Sharpe, max drawdown, win rate)."
        )
    if any(term in lower for term in ["derivatives", "options", "stochastic", "volatility", "interest rate"]):
        return (
            f"Add a pricing/risk case study for {skill} with model choice, assumptions, and numerical validation."
        )
    if any(term in lower for term in ["risk", "factor", "portfolio", "statistics", "time series"]):
        return (
            f"Show {skill} in a quantified workflow (problem, method, result) and include at least one measurable outcome."
        )
    if any(term in lower for term in ["python", "c++", "sql", "machine learning", "quantlib"]):
        return (
            f"Include a concrete implementation example for {skill} (stack used, scale, and impact)."
        )
    return f"Add a quantified bullet or project proving {skill} with concrete evidence and outcomes."


_RECOMMENDATION_SYSTEM = (
    "You classify whether a missing skill gap is a positioning issue for quant resumes.\n"
    "A positioning issue means the candidate is already doing the work but has not used the "
    "right label — so a hiring manager scanning for that skill would miss it.\n"
    "A real gap means the candidate has genuinely not done that type of work.\n\n"
    "Rules:\n"
    "1) Use ONLY the supplied `resume_evidence` lines.\n"
    "2) Never hallucinate evidence or metrics.\n"
    "3) Set is_positioning=true when `resume_evidence` describes the same underlying work as "
    "target_skill under a different label.\n"
    "4) Set is_positioning=false when `resume_evidence` shows a related-but-distinct skill "
    "that does not constitute doing the target_skill.\n"
    "5) Keep reason to one concise sentence.\n"
    "6) Return the same candidate_id provided in input.\n"
    "7) Return JSON only.\n\n"
    "Examples:\n"
    "- target_skill='Algorithmic Trading', evidence includes backtesting strategies with "
    "Sharpe ratio / drawdown / win-rate → is_positioning=true. "
    "Building and testing systematic strategies IS algorithmic trading work; the label is missing.\n"
    "- target_skill='Signal Research', evidence includes backtesting alpha factors or "
    "studying return predictors → is_positioning=true.\n"
    "- target_skill='C++', evidence only shows Python or SQL → is_positioning=false. "
    "Proficiency in one language does not imply proficiency in another.\n"
    "- target_skill='Stochastic Calculus', evidence only shows general statistics → "
    "is_positioning=false. Statistics is adjacent but not the same."
)


def _collect_matched_evidence(
    matched_skills: List[str],
    evidence_by_skill: Dict[str, List[str]],
    max_lines: int = 4,
) -> List[str]:
    """Return up to max_lines evidence lines from matched skills."""
    lines: List[str] = []
    for skill in matched_skills:
        snippets = evidence_by_skill.get(skill.lower(), [])
        if not snippets:
            continue
        lines.append(f"{skill}: {_trim_text(snippets[0], max_chars=120)}")
        if len(lines) >= max_lines:
            break
    return lines


def _build_skill_positioning_candidates(
    career_matches: List[Dict[str, Any]],
    evidence_by_skill: Dict[str, List[str]],
    max_skills: int = 10,
) -> List[Dict[str, Any]]:
    """One LLM candidate per unique missing skill across all career matches."""
    seen: set[str] = set()
    candidates: List[Dict[str, Any]] = []

    for match in career_matches[:5]:
        matched_required = [s for s in match.get("matched_required", []) if isinstance(s, str)]
        matched_preferred = [s for s in match.get("matched_preferred", []) if isinstance(s, str)]
        matched_skills = _dedupe_strings(matched_required + matched_preferred)

        missing_required = [s for s in match.get("missing_required", []) if isinstance(s, str) and s.strip()]
        missing_preferred = [s for s in match.get("missing_preferred", []) if isinstance(s, str) and s.strip()]

        for skill in missing_required + missing_preferred:
            skill_lower = skill.lower()
            if skill_lower in seen:
                continue
            seen.add(skill_lower)
            evidence_lines = _collect_matched_evidence(matched_skills, evidence_by_skill, max_lines=4)
            candidates.append({
                "candidate_id": skill_lower,
                "target_skill": skill,
                "resume_evidence": evidence_lines,
            })
            if len(candidates) >= max_skills:
                return candidates

    return candidates


def _build_recommendation_specs(
    career_matches: List[Dict[str, Any]],
    evidence_by_skill: Dict[str, List[str]],
    max_items: int = 6,
) -> List[Dict[str, Any]]:
    """Career×skill specs that become the final recommendation entries."""
    specs: List[Dict[str, Any]] = []
    seen_pairs: set[Tuple[str, str]] = set()

    for match in career_matches[:4]:
        title = str(match.get("title", "")).strip()
        if not title:
            continue

        missing_required = [s for s in match.get("missing_required", []) if isinstance(s, str) and s.strip()]
        missing_preferred = [s for s in match.get("missing_preferred", []) if isinstance(s, str) and s.strip()]
        if not missing_required and not missing_preferred:
            continue

        targets = missing_required if missing_required else missing_preferred
        reason_tag = "required" if missing_required else "preferred"
        matched_required = [s for s in match.get("matched_required", []) if isinstance(s, str)]
        matched_preferred = [s for s in match.get("matched_preferred", []) if isinstance(s, str)]
        matched_skills = _dedupe_strings(matched_required + matched_preferred)

        for skill in targets[:2]:
            pair = (title.lower(), skill.lower())
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            evidence_lines = _collect_matched_evidence(matched_skills, evidence_by_skill, max_lines=2)
            specs.append({
                "career": title,
                "target_skill": skill,
                "target_skill_lower": skill.lower(),
                "priority": "High" if reason_tag == "required" else "Medium",
                "baseline_gap_type": reason_tag,
                "resume_evidence": evidence_lines,
            })
            if len(specs) >= max_items:
                return specs

    return specs


def classify_positioning_with_retries(
    llm: OpenAILLM,
    candidates: List[Dict[str, Any]],
    max_retries: int = 2,
) -> Dict[str, Dict[str, Any]]:
    if not candidates:
        return {}

    user_prompt = (
        'Return JSON with this exact shape:\n'
        '{\n'
        '  "decisions": [\n'
        '    {\n'
        '      "candidate_id": "career::target_skill (lowercase)",\n'
        '      "career": "Career Title",\n'
        '      "target_skill": "Skill Name",\n'
        '      "is_positioning": true,\n'
        '      "reason": "single-sentence reasoning"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        'CANDIDATES:\n'
        f'{json.dumps(candidates, ensure_ascii=True)}'
    )

    prompt = user_prompt
    for attempt in range(max_retries):
        raw = llm.generate(_RECOMMENDATION_SYSTEM, prompt, max_tokens=1600)
        try:
            parsed = json.loads(_extract_json_str(raw))
            raw_items = parsed.get("decisions", [])
            if not isinstance(raw_items, list):
                raise ValueError("decisions must be a list")
            out: Dict[str, Dict[str, Any]] = {}
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                candidate_id = str(item.get("candidate_id", "")).strip().lower()
                career = str(item.get("career", "")).strip()
                target_skill = str(item.get("target_skill", "")).strip()
                derived_id = f"{career}::{target_skill}".strip().lower()
                key = candidate_id or derived_id
                if not key:
                    continue
                raw_is_positioning = item.get("is_positioning")
                is_positioning = False
                if isinstance(raw_is_positioning, bool):
                    is_positioning = raw_is_positioning
                elif isinstance(raw_is_positioning, str):
                    is_positioning = raw_is_positioning.strip().lower() in {"true", "yes", "1"}
                reason = _trim_text(str(item.get("reason", "")).strip(), max_chars=220)
                if not reason:
                    continue
                out[key] = {
                    "is_positioning": is_positioning,
                    "reason": reason,
                }
            return out
        except (json.JSONDecodeError, ValueError) as e:
            prompt = (
                user_prompt
                + "\n\nREPAIR: Output was invalid JSON matching the required schema."
                + f"\nError: {e}"
            )
            time.sleep(0.5 * (2 ** attempt))

    return {}


def _default_recommendation_why(skill: str, title: str, gap_type: str) -> str:
    if gap_type == "positioning":
        return (
            f"{skill} may already be implied for {title}, but it is not explicitly signposted, so role matching can miss it."
        )
    return (
        f"{skill} is currently missing for {title} ({gap_type} skill), which directly reduces this career score."
    )


def _default_recommendation_action(skill: str, gap_type: str) -> str:
    if gap_type == "positioning":
        return (
            f"Rephrase one relevant bullet so {skill} is explicitly named, and attach measurable outputs."
        )
    return _build_action_text(skill)


def _string_list(value: Any, max_items: int = 5) -> List[str]:
    if not isinstance(value, list):
        return []
    cleaned = [str(item).strip() for item in value if isinstance(item, str) and item.strip()]
    return _dedupe_strings(cleaned)[:max_items]


def ensure_assessment_defaults(
    resume_data: Dict[str, Any],
    extraction: Dict[str, Any],
    career_matches: List[Dict[str, Any]],
) -> None:
    assessment = resume_data.get("assessment")
    if not isinstance(assessment, dict):
        assessment = {}
        resume_data["assessment"] = assessment

    strengths = _string_list(assessment.get("strengths"))
    gaps = _string_list(assessment.get("gaps"))

    skills_raw = extraction.get("skills", [])
    skills_list = skills_raw if isinstance(skills_raw, list) else []

    if not strengths:
        ranked_strengths: List[Tuple[float, str]] = []
        for item in skills_list:
            if not isinstance(item, dict):
                continue
            skill_name = item.get("skill")
            if not isinstance(skill_name, str) or not skill_name.strip():
                continue
            category = item.get("category")
            if isinstance(category, str) and not _is_quant_category(category):
                continue
            snippets = item.get("evidence", [])
            if not isinstance(snippets, list) or len(snippets) == 0:
                continue
            confidence = _to_float(item.get("confidence"), default=0.0)
            ranked_strengths.append((confidence, skill_name.strip()))
        ranked_strengths.sort(key=lambda row: row[0], reverse=True)
        strengths = _dedupe_strings([name for _, name in ranked_strengths])[:4]

    top_match = career_matches[0] if career_matches else {}
    if not gaps and isinstance(top_match, dict):
        missing_required = _string_list(top_match.get("missing_required"), max_items=4)
        missing_preferred = _string_list(top_match.get("missing_preferred"), max_items=4)
        gaps = _dedupe_strings(missing_required + missing_preferred)[:4]

    if not strengths and isinstance(top_match, dict):
        matched_required = _string_list(top_match.get("matched_required"), max_items=4)
        matched_preferred = _string_list(top_match.get("matched_preferred"), max_items=4)
        strengths = _dedupe_strings(matched_required + matched_preferred)[:4]

    quant_relevance = assessment.get("quant_relevance")
    if not isinstance(quant_relevance, str) or not quant_relevance.strip():
        if career_matches:
            leader = career_matches[0]
            leader_title = str(leader.get("title", "quant roles")).strip()
            leader_score = int(_to_float(leader.get("match_percentage"), default=0.0))
            quant_relevance = (
                f"Profile shows quant-relevant signals with strongest fit currently around {leader_title} "
                f"({leader_score}% match)."
            )
        else:
            quant_relevance = "Profile contains quant-related signals, but evidence is currently limited."

    overall_score_raw = assessment.get("overall_score")
    overall_score = int(_to_float(overall_score_raw, default=0.0))
    if overall_score < 1 or overall_score > 10:
        if career_matches:
            leader = career_matches[0]
            leader_score = int(_to_float(leader.get("match_percentage"), default=0.0))
            overall_score = max(1, min(10, round(leader_score / 10)))
        else:
            overall_score = 1

    assessment["strengths"] = strengths
    assessment["gaps"] = gaps
    assessment["quant_relevance"] = quant_relevance
    assessment["overall_score"] = overall_score


def build_improvement_recommendations(
    career_matches: List[Dict[str, Any]],
    evidence_by_skill: Dict[str, List[str]],
    llm: OpenAILLM,
    max_items: int = 6,
) -> List[Dict[str, Any]]:
    # Classify positioning once per unique missing skill (not per career×skill)
    skill_candidates = _build_skill_positioning_candidates(career_matches, evidence_by_skill)
    llm_decisions = classify_positioning_with_retries(llm, skill_candidates)

    # Build per-career×skill recommendation specs
    specs = _build_recommendation_specs(career_matches, evidence_by_skill, max_items)
    recommendations: List[Dict[str, Any]] = []

    for spec in specs:
        career = str(spec.get("career", "")).strip()
        target_skill = str(spec.get("target_skill", "")).strip()
        if not career or not target_skill:
            continue
        baseline_gap_type = str(spec.get("baseline_gap_type", "preferred")).strip().lower()
        if baseline_gap_type not in {"required", "preferred"}:
            baseline_gap_type = "preferred"
        evidence_lines = [
            item for item in spec.get("resume_evidence", [])
            if isinstance(item, str) and item.strip()
        ][:2]

        # Look up by skill only — same decision applies across all careers
        skill_lower = spec.get("target_skill_lower", target_skill.lower())
        decision = llm_decisions.get(skill_lower, {})
        is_positioning = bool(decision.get("is_positioning", False))
        gap_type = "positioning" if (is_positioning and evidence_lines) else baseline_gap_type

        if gap_type == "positioning":
            why = str(decision.get("reason", "")).strip() or _default_recommendation_why(
                target_skill, career, gap_type,
            )
        else:
            why = _default_recommendation_why(target_skill, career, gap_type)

        action = _default_recommendation_action(target_skill, gap_type)

        recommendations.append({
            "career": career,
            "target_skill": target_skill,
            "priority": str(spec.get("priority", "Medium")),
            "gap_type": gap_type,
            "why": why,
            "action": action,
            "resume_evidence": evidence_lines,
        })

    return recommendations


# ----------------------------
# 4) FAISS Vector Store
# ----------------------------

class SentenceTransformerEmbedder:
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2") -> None:
        self.model = SentenceTransformer(model_name)

    def embed(self, texts: List[str]) -> np.ndarray:
        vecs = self.model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        return vecs.astype(np.float32)


class SkillVectorStore:
    def __init__(self, embedder: SentenceTransformerEmbedder) -> None:
        self.embedder = embedder
        self.index: Optional[faiss.IndexFlatIP] = None
        self.docs: List[Dict[str, Any]] = []

    def build(self, taxonomy: List[SkillTaxonomyItem]) -> None:
        self.docs = []
        texts = []
        for item in taxonomy:
            doc = {
                "canonical": item.canonical,
                "category": item.category,
                "aliases": list(item.aliases),
                "description": item.description,
            }
            text = (
                f"{item.canonical}\nCategory: {item.category}\n"
                f"Aliases: {', '.join(item.aliases)}\n{item.description}"
            )
            self.docs.append(doc)
            texts.append(text)
        emb = self.embedder.embed(texts)
        dim = emb.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(emb)

    def query(self, text: str, top_k: int = 30) -> List[Dict[str, Any]]:
        if self.index is None:
            raise RuntimeError("Vector store not built.")
        q = self.embedder.embed([text])
        scores, idx = self.index.search(q, top_k)
        out = []
        for i, s in zip(idx[0].tolist(), scores[0].tolist()):
            if i < 0:
                continue
            d = dict(self.docs[i])
            d["score"] = float(s)
            out.append(d)
        return out


# ----------------------------
# 5) OpenAI LLM
# ----------------------------

class OpenAILLM:
    def __init__(self, model_name: str = "gpt-4o-mini") -> None:
        self.model_name = model_name
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def generate(self, system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> str:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.0,
        )
        return (response.choices[0].message.content or "").strip()


# ----------------------------
# 6) Full resume parsing
# ----------------------------

_PARSE_SYSTEM = (
    "You are a resume parser specialised in quant finance. "
    "Extract ALL information from the resume text and return a single valid JSON object. "
    "Use null for missing fields, empty arrays [] for missing lists. "
    "Return ONLY the JSON object — no markdown fences, no commentary."
)

_PARSE_SCHEMA = """{
  "personal": {"name": null, "email": null, "phone": null, "location": null, "linkedin": null, "github": null, "website": null},
  "summary": null,
  "experience": [{"company": "", "role": "", "location": null, "start": null, "end": null, "bullets": []}],
  "education": [{"institution": "", "degree": null, "field": null, "start": null, "end": null, "gpa": null, "notes": []}],
  "skills": {"technical": [], "soft": [], "languages": []},
  "projects": [{"name": "", "description": null, "technologies": [], "url": null}],
  "certifications": [{"name": "", "issuer": null, "date": null}],
  "assessment": {
    "strengths": [],
    "gaps": [],
    "quant_relevance": "2-3 sentences on relevance to quant finance roles",
    "overall_score": 7
  }
}"""

_EMPTY_RESUME: Dict[str, Any] = {
    "personal": {"name": None, "email": None, "phone": None,
                 "location": None, "linkedin": None, "github": None, "website": None},
    "summary": None,
    "experience": [],
    "education": [],
    "skills": {"technical": [], "soft": [], "languages": []},
    "projects": [],
    "certifications": [],
    "assessment": {
        "strengths": [], "gaps": [],
        "quant_relevance": "Could not parse resume.", "overall_score": 0,
    },
}


def parse_full_resume(text: str, llm: OpenAILLM) -> Dict[str, Any]:
    user_prompt = (
        f"Return JSON matching EXACTLY this structure:\n{_PARSE_SCHEMA}\n\n"
        "Rules:\n"
        "- assessment.overall_score: integer 1-10 for strength as a quant finance candidate\n"
        "- assessment.quant_relevance: 2-3 sentences on quant finance relevance\n\n"
        f"RESUME TEXT:\n{text[:8000]}"
    )
    raw = llm.generate(_PARSE_SYSTEM, user_prompt, max_tokens=3000)
    cleaned = _extract_json_str(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return dict(_EMPTY_RESUME)


# ----------------------------
# 7) Skill extraction (RAG)
# ----------------------------

_SKILL_SYSTEM = (
    "You are a quant finance resume skill extraction engine. "
    "Rules:\n"
    "1) Output MUST be valid JSON matching the schema.\n"
    "2) ONLY extract skills explicitly present in the resume text.\n"
    "3) Every skill MUST include at least one verbatim evidence snippet.\n"
    "4) The 'skill' field MUST be one of the canonical skills provided.\n"
    "5) Lower confidence or omit if evidence is weak.\n"
    "6) Output JSON ONLY. No markdown. No commentary."
)


def _build_skill_prompt(resume_text: str, retrieved: List[Dict[str, Any]]) -> str:
    canonical_block = "\n".join(
        f"- {d['canonical']} (Category: {d['category']})" for d in retrieved
    )
    return (
        'Return JSON with this exact shape:\n'
        '{\n'
        '  "skills": [\n'
        '    {\n'
        '      "skill": "CANONICAL_SKILL_NAME",\n'
        '      "category": "category",\n'
        '      "level": "beginner/intermediate/advanced/expert or null",\n'
        '      "confidence": 0.0-1.0,\n'
        '      "evidence": ["verbatim snippet from resume"]\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        f'CANONICAL SKILLS (choose ONLY from this list):\n{canonical_block}\n\n'
        f'RESUME TEXT:\n{resume_text}'
    )


def _extract_json_str(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"(\{.*\})", text, re.DOTALL)
    if m2:
        return m2.group(1).strip()
    return text


def extract_skills_with_retries(llm: OpenAILLM, user_prompt: str, max_retries: int = 3) -> Dict[str, Any]:
    up = user_prompt
    for attempt in range(max_retries):
        raw = llm.generate(_SKILL_SYSTEM, up)
        try:
            data = json.loads(_extract_json_str(raw))
            if "skills" not in data:
                data = {"skills": []}
            return data
        except (json.JSONDecodeError, ValueError) as e:
            up = user_prompt + f"\n\nREPAIR: Output was invalid JSON. Return ONLY valid JSON.\nError: {e}"
            time.sleep(0.5 * (2 ** attempt))
    return {"skills": []}


# ----------------------------
# 8) Career Matching
# ----------------------------

def calculate_career_matches(
    skill_names: List[str],
    evidence_by_skill: Optional[Dict[str, List[str]]] = None,
) -> List[Dict[str, Any]]:
    skill_set = {s.lower() for s in skill_names}
    evidence = evidence_by_skill or {}
    matches = []
    for career, profile in CAREER_PROFILES.items():
        required = profile["required"]
        preferred = profile["preferred"]
        matched_req = _dedupe_strings([s for s in required if s.lower() in skill_set])
        matched_pref = _dedupe_strings([s for s in preferred if s.lower() in skill_set])
        missing_required = _dedupe_strings([s for s in required if s.lower() not in skill_set])
        missing_preferred = _dedupe_strings([s for s in preferred if s.lower() not in skill_set])
        req_score = len(matched_req) / len(required) * 60 if required else 0
        pref_score = len(matched_pref) / len(preferred) * 40 if preferred else 0
        match_evidence: List[Dict[str, str]] = []
        seen_evidence_snippets: set[str] = set()
        for skill in matched_req + matched_pref:
            snippets = evidence.get(skill.lower(), [])
            if snippets:
                snippet = _trim_text(snippets[0], max_chars=140)
                snippet_key = snippet.lower()
                if snippet_key in seen_evidence_snippets:
                    continue
                seen_evidence_snippets.add(snippet_key)
                match_evidence.append({
                    "skill": skill,
                    "snippet": snippet,
                })
            if len(match_evidence) >= 4:
                break
        matches.append({
            "title": career,
            "match_percentage": int(req_score + pref_score),
            "matched_skills": matched_req + matched_pref,
            "matched_required": matched_req,
            "matched_preferred": matched_pref,
            "missing_skills": missing_required,
            "missing_required": missing_required,
            "missing_preferred": missing_preferred,
            "required_score": round(req_score, 1),
            "preferred_score": round(pref_score, 1),
            "required_coverage": f"{len(matched_req)}/{len(required)}",
            "preferred_coverage": f"{len(matched_pref)}/{len(preferred)}",
            "score_explanation": _build_score_explanation(
                missing_required=missing_required,
                missing_preferred=missing_preferred,
            ),
            "resume_evidence": match_evidence,
            "category": profile["category"],
        })
    matches.sort(key=lambda x: x["match_percentage"], reverse=True)
    return matches


# ----------------------------
# 9) Highlight extraction
# ----------------------------

def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _add_highlight(
    out: List[str],
    seen: set[str],
    candidate: str,
    max_items: int,
    require_quant: bool = False,
) -> None:
    if len(out) >= max_items:
        return
    cleaned = _normalize_whitespace(candidate)
    if len(cleaned) < 12:
        return
    if require_quant and not _is_quant_related_text(cleaned):
        return
    key = cleaned.lower()
    if key in seen:
        return
    seen.add(key)
    out.append(cleaned)


def build_extracted_highlights(
    resume_data: Dict[str, Any],
    extraction: Dict[str, Any],
    max_items: int = 3,
) -> List[str]:
    highlights: List[str] = []
    seen: set[str] = set()

    skills = extraction.get("skills", [])
    if isinstance(skills, list):
        for item in skills:
            if not isinstance(item, dict):
                continue
            skill_name = item.get("skill")
            category = item.get("category")
            if isinstance(category, str) and not _is_quant_category(category):
                continue
            evidence = item.get("evidence", [])
            if not isinstance(evidence, list):
                continue
            for snippet in evidence:
                if not isinstance(snippet, str):
                    continue
                if isinstance(skill_name, str) and skill_name.strip():
                    _add_highlight(
                        highlights,
                        seen,
                        f"{skill_name.strip()}: {snippet}",
                        max_items,
                        require_quant=True,
                    )
                else:
                    _add_highlight(highlights, seen, snippet, max_items, require_quant=True)
                if len(highlights) >= max_items:
                    return highlights

    experience = resume_data.get("experience", [])
    if isinstance(experience, list):
        for role in experience:
            if not isinstance(role, dict):
                continue
            bullets = role.get("bullets", [])
            if not isinstance(bullets, list):
                continue
            for bullet in bullets:
                if not isinstance(bullet, str):
                    continue
                _add_highlight(highlights, seen, bullet, max_items, require_quant=True)
                if len(highlights) >= max_items:
                    return highlights

    projects = resume_data.get("projects", [])
    if isinstance(projects, list):
        for project in projects:
            if not isinstance(project, dict):
                continue
            description = project.get("description")
            if isinstance(description, str):
                _add_highlight(highlights, seen, description, max_items, require_quant=True)
            if len(highlights) >= max_items:
                return highlights

    summary = resume_data.get("summary")
    if isinstance(summary, str):
        _add_highlight(highlights, seen, summary, max_items, require_quant=True)

    return highlights


# ----------------------------
# 10) Text extraction
# ----------------------------

def extract_text_from_pdf(content: bytes) -> str:
    parts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


def extract_text_from_docx(content: bytes) -> str:
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs)


# ----------------------------
# 11) CLI entry point
# ----------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Quant finance resume analyser")
    parser.add_argument("--file", required=True, help="Path to resume (PDF / DOCX / TXT)")
    args = parser.parse_args()

    fpath = Path(args.file)
    if not fpath.exists():
        print(json.dumps({"error": f"File not found: {args.file}"}), file=sys.stderr)
        sys.exit(1)

    with open(fpath, "rb") as f:
        content = f.read()

    ext = fpath.suffix.lower()
    if ext == ".pdf":
        text = extract_text_from_pdf(content)
    elif ext in (".docx", ".doc"):
        text = extract_text_from_docx(content)
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        print(json.dumps({"error": "Could not extract text from file"}), file=sys.stderr)
        sys.exit(1)

    # Initialise models — all progress lines go to stderr to keep stdout clean for JSON
    print("Loading models...", file=sys.stderr)
    embedder = SentenceTransformerEmbedder()
    vector_store = SkillVectorStore(embedder)
    vector_store.build(get_taxonomy())
    llm = OpenAILLM(model_name=os.getenv("OPENAI_MODEL_RESUME", os.getenv("OPENAI_MODEL", "gpt-4o-mini")))
    print("Models ready.", file=sys.stderr)

    # Full structured parse (personal, experience, education, assessment…)
    print("Parsing resume structure...", file=sys.stderr)
    resume_data = parse_full_resume(text, llm)

    # Quant skill extraction via RAG
    print("Extracting quant skills...", file=sys.stderr)
    retrieved = vector_store.query(text, top_k=30)
    skill_prompt = _build_skill_prompt(text, retrieved)
    extraction = extract_skills_with_retries(llm, skill_prompt)
    skill_names = [s["skill"] for s in extraction.get("skills", []) if isinstance(s, dict) and "skill" in s]
    evidence_by_skill = build_skill_evidence_map(extraction)

    # Extracted highlights for UI display
    resume_data["highlights"] = build_extracted_highlights(resume_data, extraction, max_items=3)

    # Career matching
    career_matches = calculate_career_matches(skill_names, evidence_by_skill)[:8]
    resume_data["career_matches"] = career_matches
    ensure_assessment_defaults(resume_data, extraction, career_matches)
    resume_data["improvement_recommendations"] = build_improvement_recommendations(
        career_matches=career_matches,
        evidence_by_skill=evidence_by_skill,
        llm=llm,
    )

    # Single JSON blob to stdout — Next.js route reads this
    print(json.dumps(resume_data))


if __name__ == "__main__":
    main()

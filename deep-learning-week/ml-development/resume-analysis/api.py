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
# 3) FAISS Vector Store
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
# 4) OpenAI LLM
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
# 5) Full resume parsing
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
# 6) Skill extraction (RAG)
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
# 7) Career Matching
# ----------------------------

def calculate_career_matches(skill_names: List[str]) -> List[Dict[str, Any]]:
    skill_set = {s.lower() for s in skill_names}
    matches = []
    for career, profile in CAREER_PROFILES.items():
        required = profile["required"]
        preferred = profile["preferred"]
        matched_req = [s for s in required if s.lower() in skill_set]
        matched_pref = [s for s in preferred if s.lower() in skill_set]
        req_score = len(matched_req) / len(required) * 60 if required else 0
        pref_score = len(matched_pref) / len(preferred) * 40 if preferred else 0
        matches.append({
            "title": career,
            "match_percentage": int(req_score + pref_score),
            "matched_skills": matched_req + matched_pref,
            "missing_skills": [s for s in required if s.lower() not in skill_set],
            "category": profile["category"],
        })
    matches.sort(key=lambda x: x["match_percentage"], reverse=True)
    return matches


# ----------------------------
# 8) Text extraction
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
# 9) CLI entry point
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
    skill_names = [s["skill"] for s in extraction.get("skills", []) if "skill" in s]

    # Career matching
    resume_data["career_matches"] = calculate_career_matches(skill_names)[:8]

    # Single JSON blob to stdout — Next.js route reads this
    print(json.dumps(resume_data))


if __name__ == "__main__":
    main()

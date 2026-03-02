"""
RAG pipeline CLI — PDF indexing and querying for the coaching chatbot.

Usage:
    # Build FAISS index from a PDF
    python3 rag_cli.py index --file resume.pdf --index-dir /tmp/rag_abc123

    # Query against an existing index
    python3 rag_cli.py query --question "What is the budget for AI?" --index-dir /tmp/rag_abc123

All diagnostic output goes to stderr. Only the final JSON result goes to stdout.

Dependencies:
    pip install -r ml-development/rag-pipeline/requirements.txt
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import faiss
import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import pdfplumber
from docx import Document as DocxDocument

# Load .env.local for standalone use (subprocess inherits env from Next.js automatically)
for _cand in [
    Path(__file__).parent.parent / ".env.local",
    Path(__file__).parent.parent / ".env",
]:
    if _cand.exists():
        load_dotenv(_cand)
        break

# ── Config ────────────────────────────────────────────────────────────────────

CHUNK_SIZE    = 500
CHUNK_OVERLAP = 100
TOP_K         = 5
EMBED_MODEL   = "all-MiniLM-L6-v2"
CITATION_RE   = re.compile(r"\[(c\d+\.\d+\.\d+(?:,\s*c\d+\.\d+\.\d+)*)\]")

OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


# ── Ollama helper ─────────────────────────────────────────────────────────────

def call_ollama(prompt: str, model: str = OLLAMA_MODEL, max_tokens: int = 1024) -> str:
    resp = requests.post(
        f"{OLLAMA_HOST}/api/chat",
        json={
            "model":    model,
            "messages": [{"role": "user", "content": prompt}],
            "stream":   False,
            "options":  {"num_predict": max_tokens},
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_pages_from_pdf(path: str) -> List[Dict[str, Any]]:
    pages = []
    with pdfplumber.open(path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page": page_num, "text": text.strip()})
    return pages


def extract_pages_from_docx(path: str) -> List[Dict[str, Any]]:
    doc = DocxDocument(path)
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return [{"page": 1, "text": text}]


def extract_pages_from_txt(path: str) -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8", errors="ignore") as f:
        return [{"page": 1, "text": f.read()}]


def extract_pages(path: str) -> List[Dict[str, Any]]:
    ext = Path(path).suffix.lower()
    if ext == ".pdf":
        return extract_pages_from_pdf(path)
    elif ext in (".docx", ".doc"):
        return extract_pages_from_docx(path)
    else:
        return extract_pages_from_txt(path)


# ── Recursive character splitter (no LangChain) ───────────────────────────────

_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def _merge_splits(splits: List[str], sep: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """Merge small splits into overlap-aware chunks."""
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for s in splits:
        s_len    = len(s)
        join_len = len(sep) if current else 0
        if current_len + join_len + s_len > chunk_size and current:
            chunks.append(sep.join(current))
            # Trim from the front until we're under the overlap budget
            while current and current_len > chunk_overlap:
                removed      = current.pop(0)
                current_len -= len(removed) + len(sep)
        current.append(s)
        current_len += s_len + (len(sep) if len(current) > 1 else 0)

    if current:
        chunks.append(sep.join(current))
    return chunks


def _split_text(text: str, separators: List[str], chunk_size: int, chunk_overlap: int) -> List[str]:
    """Recursively split text trying separators in priority order."""
    # Pick the first separator that actually appears in the text
    sep       = ""
    next_seps: List[str] = []
    for i, s in enumerate(separators):
        if s == "" or s in text:
            sep       = s
            next_seps = separators[i + 1:]
            break

    raw_splits = text.split(sep) if sep else list(text)

    good:  List[str] = []
    final: List[str] = []

    for piece in raw_splits:
        if not piece:
            continue
        if len(piece) <= chunk_size:
            good.append(piece)
        else:
            # Flush small pieces accumulated so far
            if good:
                final.extend(_merge_splits(good, sep, chunk_size, chunk_overlap))
                good = []
            # Recurse into the oversized piece with remaining separators
            if next_seps:
                final.extend(_split_text(piece, next_seps, chunk_size, chunk_overlap))
            else:
                final.append(piece)

    if good:
        final.extend(_merge_splits(good, sep, chunk_size, chunk_overlap))

    return final


def chunk_pages(pages: List[Dict[str, Any]], chunk_size: int, chunk_overlap: int) -> List[Dict[str, Any]]:
    """Split pages into semantically-aware chunks using recursive character splitting."""
    chunks = []
    for page in pages:
        page_num = page["page"]
        texts    = _split_text(page["text"], _SEPARATORS, chunk_size, chunk_overlap)
        for chunk_idx, text in enumerate(texts):
            text = text.strip()
            if text:
                chunks.append({
                    "text":        text,
                    "page":        page_num,
                    "chunk_idx":   chunk_idx,
                    "citation_id": f"c{page_num}.0.{chunk_idx}",
                    "preview":     text[:120],
                })
    return chunks


# ── Embedding & FAISS ─────────────────────────────────────────────────────────

def embed_chunks(chunks: List[Dict[str, Any]], model_name: str) -> tuple[faiss.IndexFlatIP, SentenceTransformer]:
    print(f"Loading embedding model: {model_name}", file=sys.stderr)
    model = SentenceTransformer(model_name)
    texts = [c["text"] for c in chunks]
    print(f"Embedding {len(texts)} chunks…", file=sys.stderr)
    emb   = model.encode(texts, normalize_embeddings=True, show_progress_bar=False).astype(np.float32)
    index = faiss.IndexFlatIP(emb.shape[1])
    index.add(emb)
    return index, model


def retrieve(question: str, index: faiss.IndexFlatIP, chunks: List[Dict[str, Any]],
             model: SentenceTransformer, k: int = TOP_K) -> List[Dict[str, Any]]:
    q_emb        = model.encode([question], normalize_embeddings=True, show_progress_bar=False).astype(np.float32)
    scores, idx  = index.search(q_emb, k)
    results      = []
    for i, s in zip(idx[0].tolist(), scores[0].tolist()):
        if i >= 0:
            c = dict(chunks[i])
            c["score"] = float(s)
            results.append(c)
    return results


# ── Prompt building ───────────────────────────────────────────────────────────

def build_rag_prompt(question: str, chunks: List[Dict[str, Any]]) -> str:
    context = "Retrieved document sections:\n"
    for chunk in chunks:
        context += f"\n{'=' * 60}\n"
        context += f"Citation ID: {chunk['citation_id']}  |  Page: {chunk['page']}\n"
        context += f"{'=' * 60}\n"
        context += chunk["text"] + "\n"

    return f"""You are a helpful assistant answering questions based solely on the provided document sections.

{context}

Question: {question}

Instructions:
- Answer based ONLY on the provided sections. Do not use outside knowledge.
- Cite sources inline immediately after each claim using the Citation ID in square brackets, e.g. [c3.0.0].
- If multiple sections support a claim, list all relevant IDs: [c3.0.0, c5.0.1].
- If the answer is not in the provided sections, say "I don't have information about this in the document."

Answer:"""


# ── Citation linking ──────────────────────────────────────────────────────────

def link_citations(response: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    lookup  = {c["citation_id"]: c for c in chunks}
    all_ids: List[str] = []
    for match in CITATION_RE.findall(response):
        for cid in match.split(","):
            cid = cid.strip()
            if cid not in all_ids:
                all_ids.append(cid)

    citations = [
        {"id": cid, "page": lookup[cid]["page"], "text": lookup[cid]["preview"]}
        for cid in all_ids
        if cid in lookup
    ]
    return {"response": response, "citations": citations}


# ── Claim-level LLM-as-a-Judge ────────────────────────────────────────────────

def _extract_citation_ids(text: str) -> List[str]:
    ids: List[str] = []
    for match in CITATION_RE.findall(text):
        for cid in match.split(","):
            cid = cid.strip()
            if cid not in ids:
                ids.append(cid)
    return ids


def extract_claims(response: str) -> List[Dict[str, Any]]:
    """Split response into sentences and attach any citation IDs found in each."""
    sentences = re.split(r"(?<=[.!?])\s+", response.strip())
    claims: List[Dict[str, Any]] = []
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence or len(sentence) < 10:
            continue
        citation_ids = _extract_citation_ids(sentence)
        clean        = CITATION_RE.sub("", sentence).strip()
        clean        = re.sub(r"\s+([.!?,;:])", r"\1", clean)
        if clean:
            claims.append({"text": clean, "citation_ids": citation_ids})
    return claims


_JUDGE_SYSTEM = """You are a fact-checking assistant. Evaluate whether claims are supported by the provided source text.

For each claim return a JSON object with:
- "claim_index": integer (as given)
- "support_level": one of "supported" | "partial" | "unsupported" | "contradicted"
- "confidence": float 0.0–1.0
- "reasoning": one concise sentence

Output ONLY a valid JSON array. No markdown, no extra text."""


def evaluate_answer(
    response: str,
    citations: List[Dict[str, Any]],
    chunks: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Claim-level LLM-as-a-Judge: evaluate each sentence independently."""
    claims = extract_claims(response)
    if not claims:
        return None

    lookup         = {c["citation_id"]: c for c in chunks}
    cited_claims   = [c for c in claims if c["citation_ids"]]
    uncited_claims = [c for c in claims if not c["citation_ids"]]

    evaluations: List[Dict[str, Any]] = [
        {"text": c["text"], "citation_ids": [], "support_level": "uncited",
         "confidence": 0.0, "reasoning": "No citation provided."}
        for c in uncited_claims
    ]

    if cited_claims:
        prompt = "Evaluate the following claims against their cited sources:\n"
        for i, claim in enumerate(cited_claims, 1):
            prompt += f"\n---\nClaim {i}: {claim['text']}\n"
            for cid in claim["citation_ids"]:
                src     = lookup.get(cid, {})
                content = src.get("text", src.get("preview", ""))[:400]
                prompt += f"Source [{cid}]: {content}\n"
        prompt += f"\nReturn a JSON array with {len(cited_claims)} objects."

        eval_data: List[Dict] = []
        try:
            raw = call_ollama(f"{_JUDGE_SYSTEM}\n\n{prompt}", max_tokens=512)
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```\s*$", "", raw)
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                eval_data = parsed
        except Exception as e:
            print(f"[judge] parse error: {e}", file=sys.stderr)

        for i, claim in enumerate(cited_claims):
            match = next((x for x in eval_data if x.get("claim_index") == i + 1), None)
            if match is None and i < len(eval_data):
                match = eval_data[i]

            if match:
                level = match.get("support_level", "partial")
                if level not in ("supported", "partial", "unsupported", "contradicted"):
                    level = "partial"
                evaluations.append({
                    "text":          claim["text"],
                    "citation_ids":  claim["citation_ids"],
                    "support_level": level,
                    "confidence":    float(max(0.0, min(1.0, match.get("confidence", 0.5)))),
                    "reasoning":     match.get("reasoning", ""),
                })
            else:
                evaluations.append({
                    "text":          claim["text"],
                    "citation_ids":  claim["citation_ids"],
                    "support_level": "partial",
                    "confidence":    0.5,
                    "reasoning":     "Evaluator returned no result for this claim.",
                })

    cited_evals = [e for e in evaluations if e["support_level"] != "uncited"]
    overall     = (
        sum(e["confidence"] for e in cited_evals) / len(cited_evals)
        if cited_evals else 0.0
    )

    return {
        "overall_confidence": round(overall, 2),
        "supported":   sum(1 for e in evaluations if e["support_level"] == "supported"),
        "partial":     sum(1 for e in evaluations if e["support_level"] == "partial"),
        "unsupported": sum(1 for e in evaluations if e["support_level"] == "unsupported"),
        "uncited":     sum(1 for e in evaluations if e["support_level"] == "uncited"),
        "claims":      evaluations,
    }


# ── Index action ──────────────────────────────────────────────────────────────

def action_index(file_path: str, index_dir: str) -> None:
    print(f"Extracting text from: {file_path}", file=sys.stderr)
    pages = extract_pages(file_path)
    if not pages:
        print(json.dumps({"error": "Could not extract text from file"}))
        sys.exit(1)
    print(f"Extracted {len(pages)} page(s)", file=sys.stderr)

    chunks = chunk_pages(pages, CHUNK_SIZE, CHUNK_OVERLAP)
    print(f"Created {len(chunks)} chunks", file=sys.stderr)

    index, _ = embed_chunks(chunks, EMBED_MODEL)

    Path(index_dir).mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(Path(index_dir) / "index.faiss"))
    with open(Path(index_dir) / "chunks.json", "w") as f:
        json.dump(chunks, f)
    print(f"Index saved to: {index_dir}", file=sys.stderr)

    print(json.dumps({
        "status":    "ok",
        "chunks":    len(chunks),
        "pages":     len(pages),
        "index_dir": index_dir,
    }))


# ── Query action ──────────────────────────────────────────────────────────────

def action_query(question: str, index_dir: str, run_evaluation: bool) -> None:
    index_path  = Path(index_dir) / "index.faiss"
    chunks_path = Path(index_dir) / "chunks.json"

    if not index_path.exists() or not chunks_path.exists():
        print(json.dumps({"error": f"Index not found at: {index_dir}"}))
        sys.exit(1)

    print(f"Loading index from: {index_dir}", file=sys.stderr)
    index  = faiss.read_index(str(index_path))
    with open(chunks_path) as f:
        chunks = json.load(f)

    print("Embedding question…", file=sys.stderr)
    model     = SentenceTransformer(EMBED_MODEL)
    retrieved = retrieve(question, index, chunks, model, k=TOP_K)
    print(f"Retrieved {len(retrieved)} chunks", file=sys.stderr)

    prompt   = build_rag_prompt(question, retrieved)
    print(f"Calling Ollama ({OLLAMA_MODEL})…", file=sys.stderr)
    response = call_ollama(prompt)

    linked = link_citations(response, retrieved)

    evaluation = None
    if run_evaluation and linked["citations"]:
        print("Running claim-level evaluation…", file=sys.stderr)
        evaluation = evaluate_answer(response, linked["citations"], retrieved)

    print(json.dumps({
        "answer":     linked["response"],
        "citations":  linked["citations"],
        "evaluation": evaluation,
    }))


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="RAG pipeline CLI")
    sub    = parser.add_subparsers(dest="action", required=True)

    idx_p = sub.add_parser("index", help="Build FAISS index from a document")
    idx_p.add_argument("--file",      required=True, help="Path to PDF / DOCX / TXT")
    idx_p.add_argument("--index-dir", required=True, help="Directory to save the index")

    qry_p = sub.add_parser("query", help="Answer a question against an existing index")
    qry_p.add_argument("--question",    required=True, help="Question to answer")
    qry_p.add_argument("--index-dir",   required=True, help="Directory containing the index")
    qry_p.add_argument("--no-evaluate", action="store_true",
                       help="Skip LLM-as-a-Judge evaluation (faster)")

    args = parser.parse_args()

    if args.action == "index":
        action_index(args.file, args.index_dir)
    elif args.action == "query":
        action_query(args.question, args.index_dir, not args.no_evaluate)


if __name__ == "__main__":
    main()

"""
Step 3 — router.py
===================
Loads the fine-tuned model and classifies queries into
simple / medium / complex, then maps to a Claude model ID.

Used directly by server.py — not meant to be run standalone,
but you can test it:

    python router.py "What is a Sharpe ratio?"
    python router.py "Derive Black-Scholes from first principles"
"""

import os
from functools import lru_cache
from transformers import pipeline

MODEL_DIR = "models/router"

# Maps router label → Ollama model name (override via env vars)
ROUTE_MAP = {
    "simple":  os.getenv("OLLAMA_MODEL_FAST",    "llama3.2"),
    "medium":  os.getenv("OLLAMA_MODEL",         "llama3.2"),
    "complex": os.getenv("OLLAMA_MODEL_CAPABLE", "mistral"),
}

# Confidence threshold: if the top label score is below this,
# fall back to medium (Sonnet) to avoid mis-routing edge cases.
CONFIDENCE_THRESHOLD = 0.70


@lru_cache(maxsize=1)
def _load_pipeline():
    """Load once, reuse across all requests."""
    return pipeline(
        "text-classification",
        model=MODEL_DIR,
        device=-1,          # CPU; change to 0 for GPU
        top_k=None,         # return all label scores
        truncation=True,
        max_length=128,
    )


def classify(query: str) -> tuple[str, float]:
    """
    Returns (label, confidence) where label is simple/medium/complex
    and confidence is the softmax probability of the top label.
    """
    results = _load_pipeline()(query)[0]           # list of {label, score}
    best = max(results, key=lambda x: x["score"])
    label = best["label"]
    score = best["score"]

    if score < CONFIDENCE_THRESHOLD:
        return "medium", score  # safe fallback

    return label, score


def route(query: str) -> tuple[str, str, float]:
    """
    Returns (model_id, label, confidence).
    Callers can log label+confidence for dataset collection.
    """
    label, confidence = classify(query)
    model_id = ROUTE_MAP[label]
    return model_id, label, confidence


if __name__ == "__main__":
    import sys
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "What is a Sharpe ratio?"
    model_id, label, confidence = route(query)
    print(f"Query:      {query}")
    print(f"Label:      {label}  (confidence: {confidence:.2%})")
    print(f"Model:      {model_id}")

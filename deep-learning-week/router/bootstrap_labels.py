"""
Step 1b — bootstrap_labels.py  (optional)
==========================================
If you have a list of unlabeled queries, this script uses Claude to
label them as simple / medium / complex and appends them to raw.csv.

Use this to quickly grow your dataset before fine-tuning.

Usage:
    python bootstrap_labels.py --input unlabeled.txt --output data/raw.csv

unlabeled.txt format — one query per line:
    What is a Sharpe ratio?
    Explain how Black-Scholes works...
"""

import os
import csv
import time
import argparse
from pathlib import Path
import anthropic

SYSTEM_PROMPT = """You are a routing classifier for a quant finance learning app.
Given a user query, classify it into exactly one of three categories:

simple  — factual lookups, single-concept definitions, basic terminology
medium  — conceptual explanations, comparisons, strategy overviews, moderate math
complex — multi-step derivations, system design, research-level questions, deep math

Reply with ONLY one word: simple, medium, or complex. No explanation."""


def label_query(client: anthropic.Anthropic, query: str) -> str:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": query}],
    )
    label = msg.content[0].text.strip().lower()
    if label not in ("simple", "medium", "complex"):
        return "medium"  # fallback
    return label


def bootstrap(input_path: str, output_path: str, delay: float = 0.1) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)

    queries = [
        line.strip()
        for line in open(input_path, encoding="utf-8")
        if line.strip() and not line.startswith("#")
    ]

    # Load existing queries to avoid duplicates
    existing = set()
    if Path(output_path).exists():
        with open(output_path, newline="", encoding="utf-8") as f:
            existing = {row["query"] for row in csv.DictReader(f)}

    new_rows = [q for q in queries if q not in existing]
    print(f"Found {len(queries)} queries, {len(new_rows)} new to label.")

    if not new_rows:
        print("Nothing to do.")
        return

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    write_header = not Path(output_path).exists()

    with open(output_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["query", "label"])
        if write_header:
            writer.writeheader()

        for i, query in enumerate(new_rows, 1):
            label = label_query(client, query)
            writer.writerow({"query": query, "label": label})
            print(f"  [{i:3d}/{len(new_rows)}] {label:8s}  {query[:70]}")
            time.sleep(delay)

    print(f"\nAppended {len(new_rows)} labeled rows to {output_path}")
    print("Next step: python prepare_data.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True, help="Path to unlabeled queries (one per line)")
    parser.add_argument("--output", default="data/raw.csv")
    parser.add_argument("--delay",  type=float, default=0.1, help="Seconds between API calls")
    args = parser.parse_args()
    bootstrap(args.input, args.output, args.delay)

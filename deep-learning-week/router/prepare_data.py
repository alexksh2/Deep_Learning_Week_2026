"""
Step 1 — prepare_data.py
========================
Reads data/raw.csv (columns: query, label) and splits it into
train/val JSON files ready for training.

Expected CSV format:
    query,label
    "What is a Sharpe ratio?",simple
    "Explain Black-Scholes from scratch...",complex

Labels must be one of: simple | medium | complex
"""

import csv
import json
import random
from pathlib import Path

LABEL_MAP = {"simple": 0, "medium": 1, "complex": 2}


def prepare(
    raw_path: str = "data/raw.csv",
    out_dir: str = "data",
    val_split: float = 0.2,
    seed: int = 42,
) -> None:
    Path(out_dir).mkdir(exist_ok=True)

    rows = []
    skipped = 0
    with open(raw_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = row["label"].strip().lower()
            if label not in LABEL_MAP:
                print(f"  Skipping unknown label '{label}': {row['query'][:60]}")
                skipped += 1
                continue
            rows.append({
                "text": row["query"].strip(),
                "label": LABEL_MAP[label],
            })

    if not rows:
        raise ValueError("No valid rows found. Check your CSV format and labels.")

    random.seed(seed)
    random.shuffle(rows)

    split = int(len(rows) * (1 - val_split))
    train, val = rows[:split], rows[split:]

    json.dump(train, open(f"{out_dir}/train.json", "w"), indent=2)
    json.dump(val,   open(f"{out_dir}/val.json",   "w"), indent=2)

    print(f"Done. Train: {len(train)}  Val: {len(val)}  Skipped: {skipped}")
    print(f"Label distribution (train):")
    inv = {v: k for k, v in LABEL_MAP.items()}
    for label_id, name in inv.items():
        count = sum(1 for r in train if r["label"] == label_id)
        print(f"  {name:8s}: {count}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw",       default="data/raw.csv")
    parser.add_argument("--out",       default="data")
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--seed",      type=int,   default=42)
    args = parser.parse_args()
    prepare(args.raw, args.out, args.val_split, args.seed)

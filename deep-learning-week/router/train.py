"""
Step 2 — train.py
==================
Fine-tunes distilbert-base-uncased as a 3-class router classifier.
Reads data/train.json and data/val.json produced by prepare_data.py.
Saves the trained model to models/router/.

Usage:
    python train.py
    python train.py --epochs 10 --lr 3e-5 --batch-size 32
"""

import json
import argparse
import numpy as np
from pathlib import Path

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
import evaluate

BASE_MODEL  = "distilbert-base-uncased"
OUTPUT_DIR  = "models/router"
LABELS      = ["simple", "medium", "complex"]
MAX_LENGTH  = 128


def load_hf_dataset(path: str) -> Dataset:
    data = json.load(open(path, encoding="utf-8"))
    return Dataset.from_list(data)


def make_tokenize_fn(tokenizer):
    def tokenize(batch):
        return tokenizer(batch["text"], truncation=True, max_length=MAX_LENGTH)
    return tokenize


def compute_metrics(eval_pred):
    metric = evaluate.load("accuracy")
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = metric.compute(predictions=preds, references=labels)

    # Per-class accuracy for debugging
    for i, name in enumerate(LABELS):
        mask = labels == i
        if mask.sum() > 0:
            class_acc = (preds[mask] == labels[mask]).mean()
            acc[f"accuracy_{name}"] = float(class_acc)
    return acc


def train(
    epochs: int = 5,
    lr: float = 2e-5,
    batch_size: int = 16,
    weight_decay: float = 0.01,
    patience: int = 2,
) -> None:
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(LABELS),
        id2label={i: l for i, l in enumerate(LABELS)},
        label2id={l: i for i, l in enumerate(LABELS)},
    )

    tokenize_fn = make_tokenize_fn(tokenizer)
    train_ds = load_hf_dataset("data/train.json").map(tokenize_fn, batched=True)
    val_ds   = load_hf_dataset("data/val.json").map(tokenize_fn,   batched=True)

    print(f"Train: {len(train_ds)} samples | Val: {len(val_ds)} samples")

    args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size * 2,
        learning_rate=lr,
        weight_decay=weight_decay,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=10,
        report_to="none",
        save_total_limit=2,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=patience)],
    )

    trainer.train()

    # Save final model + tokenizer
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    # Print final eval
    results = trainer.evaluate()
    print("\nFinal validation results:")
    for k, v in results.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")
    print(f"\nModel saved to {OUTPUT_DIR}/")
    print("Next step: python server.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs",     type=int,   default=5)
    parser.add_argument("--lr",         type=float, default=2e-5)
    parser.add_argument("--batch-size", type=int,   default=16)
    parser.add_argument("--patience",   type=int,   default=2)
    args = parser.parse_args()
    train(args.epochs, args.lr, args.batch_size, patience=args.patience)

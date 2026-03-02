"""
router_cli.py
=============
CLI wrapper for the fine-tuned router model.
Called as a subprocess by the Next.js chat API route.

Usage:
    python3 router_cli.py "What is the Sharpe ratio?"

Outputs a single JSON line:
    {"model": "gpt-4o-mini", "label": "simple", "confidence": 0.97}

Falls back to OPENAI_MODEL (default: gpt-4o-mini) if the router model is not trained yet.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from router import route
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    model_id, label, confidence = route(query)
    print(json.dumps({"model": model_id, "label": label, "confidence": confidence}))
except Exception:
    print(json.dumps({"model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"), "label": "default", "confidence": 1.0}))

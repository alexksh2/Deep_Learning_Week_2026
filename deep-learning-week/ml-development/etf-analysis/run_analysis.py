"""
run_analysis.py
===============
CLI entry point for smart beta analysis.
Called as a subprocess by the Next.js smart-beta API route.

Usage:
    python3 run_analysis.py USMV MTUM

Outputs a single JSON line to stdout.
All logging goes to stderr and is ignored by the caller.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from smart_beta_service import analyze

tickers = [t.upper() for t in sys.argv[1:] if t.strip()]
if not tickers:
    tickers = ["USMV"]

result = analyze(tickers)
print(json.dumps(result))

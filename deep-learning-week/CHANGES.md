# QLOS — Code Changes Documentation

Quantitative Learning OS (QLOS) — full change log covering all features added
to the Next.js app from the initial scaffold.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Coaching Tab — AI Chat](#3-coaching-tab--ai-chat)
4. [Model Router](#4-model-router)
5. [Trade Simulator (Alpaca)](#5-trade-simulator-alpaca)
6. [Smart Beta Analysis](#6-smart-beta-analysis)
7. [Startup — Removing uvicorn](#7-startup--removing-uvicorn)
8. [Environment Variables](#8-environment-variables)
9. [File Tree](#9-file-tree)

---

## 1. Architecture Overview

```
Browser
  └── Next.js (port 3000)
        ├── app/api/chat/route.ts          ← streams Ollama, optionally routes via Python subprocess
        ├── app/api/analysis/smart-beta/   ← spawns Python subprocess → returns JSON
        └── app/api/alpaca/*               ← proxy to Alpaca paper-trading REST API

Python (subprocess, on-demand — no persistent server)
  ├── etf-analysis/run_analysis.py         ← called by smart-beta API route
  ├── etf-analysis/smart_beta_service.py   ← caching + serialisation layer
  ├── etf-analysis/smart_beta_checks_comprehensive.py  ← core analysis (your script)
  └── router/router_cli.py                 ← called by chat route for model routing
```

**Key architectural decision:** uvicorn was removed entirely. All Python
execution happens via Node.js `child_process.spawn` — no separate server, no
port conflicts, `npm run dev` starts only Next.js.

---

## 2. Authentication

### What was built
Mock authentication backed by `localStorage` (no backend). Includes a login
page and a four-step registration wizard that collects the user's full profile.

### Files created

#### `contexts/AuthContext.tsx`
- `AuthUser` type covering identity, career intent, learning preferences
- `useAuth()` hook exposing `user`, `isLoading`, `login()`, `register()`, `logout()`
- Persists to `localStorage` under key `qlos_user`
- `login()` — matches email + password from storage, returns `{success, error}`
- `register()` — writes new user, auto-logs in
- `logout()` — clears context + storage

#### `app/login/page.tsx`
- Centered card: "Q" logo, email + password fields, sign-in button
- Error alert on bad credentials
- Demo hint with pre-filled credentials (`alexkhoo@gmail.com` / `demo1234`)
- Link to `/register`

#### `app/register/page.tsx`
- Four-step wizard shell, progress bar, step label, link back to login

#### `components/auth/RegisterWizard.tsx`
| Step | Fields |
|------|--------|
| 1 — Account | Email, Password, Confirm Password (with validation) |
| 2 — Identity | Name, School, Graduation timeline, Location, Timezone, Track badges |
| 3 — Career Intent | Target role, Timeline, Target firms, Strategy preferences |
| 4 — Aspirations | Learning style, Hours/week, Available days, North Star (textarea) |

### Files modified

#### `app/layout.tsx`
Wrapped `DashboardShell` with `<AuthProvider>` so auth state is global.

#### `components/dashboard-shell.tsx`
Added auth guard:
- Reads `useAuth()` — shows loading spinner while `isLoading` is true (prevents flash)
- Unauthenticated + non-auth-page → `router.replace("/login")`
- Authenticated + auth-page → `router.replace("/")`
- Auth pages (`/login`, `/register`) render a minimal centered layout (no sidebar)

---

## 3. Coaching Tab — AI Chat

### What was built
Full ChatGPT/Ollama-style streaming chat interface with model selection,
system prompt editing, and router metadata display.

### Files created / rewritten

#### `app/coaching/page.tsx`
- Message list with user/assistant bubbles, markdown rendering
- Model selector dropdown: Auto / llama3.1 / mistral / qwen2.5
- System prompt panel (collapsible)
- Streaming via `fetch` + `ReadableStream` reader
- Displays router badge (`X-Router-Label`, `X-Router-Model` response headers)
- Auto-scrolls to latest message

#### `app/api/chat/route.ts`
Handles chat without any external server:

```
POST /api/chat
  body: { messages, model, system }

1. If model === "auto":
     spawn router/router_cli.py <last-user-message>  (2 s timeout, falls back to local Ollama default)
     → get { model, label, confidence }
2. Call Ollama API directly with chosen model
3. Stream text chunks back to client
4. Set X-Router-Label + X-Router-Model headers
```

---

## 4. Model Router

A fine-tunable offline router that classifies queries as `simple / medium /
complex` and routes them to local Ollama models accordingly.

### Files created

| File | Purpose |
|------|---------|
| `router/prepare_data.py` | Loads raw labelled examples, tokenises, saves train/val splits |
| `router/bootstrap_labels.py` | Uses Ollama to auto-label unlabelled queries (seed data) |
| `router/train.py` | Fine-tunes `distilbert-base-uncased` as 3-class classifier |
| `router/router.py` | Inference: loads trained model, returns `(model_id, label, confidence)` |
| `router/router_cli.py` | CLI wrapper — called as subprocess by the chat API route |
| `router/requirements.txt` | Python dependencies for the router pipeline |

### Training workflow
```bash
cd router
python bootstrap_labels.py   # auto-label seed data with Ollama
python prepare_data.py        # tokenise + split
python train.py               # fine-tune distilbert (~5 min on CPU)
# model saved to router/models/router/
```

Once `models/router/` exists, `router_cli.py` uses it automatically. Until
then it falls back to `llama3.1` silently.

### `router/server.py` (kept but no longer required)
The original FastAPI server is kept in the repo for standalone use / debugging
but is **not** started by `npm run dev`.

---

## 5. Trade Simulator (Alpaca)

### What was built
Live paper-trading interface connected to Alpaca's paper trading API.

### Files created

#### `app/trade/sim/page.tsx`
- Account balance, buying power, P&L display
- Order form: symbol, qty, side (buy/sell), order type (market/limit)
- Open positions table with real-time P&L
- Order history table
- Price chart for selected symbol (candlestick via Recharts)

#### Next.js API proxy routes (`app/api/alpaca/`)
All routes proxy to `https://paper-api.alpaca.markets` using credentials from
`.env.local`. No secrets are exposed to the browser.

| Route | Method | Description |
|-------|--------|-------------|
| `/api/alpaca/account` | GET | Account info (balance, buying power) |
| `/api/alpaca/orders` | GET, POST | List orders / place new order |
| `/api/alpaca/orders/[orderId]` | DELETE | Cancel an order |
| `/api/alpaca/positions` | GET | Open positions |
| `/api/alpaca/bars/[symbol]` | GET | OHLCV bar data for chart |
| `/api/alpaca/sessions` | GET | Market session status |

### Environment variables added
```
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets
```

---

## 6. Smart Beta Analysis

### What was built
An Analysis tab under Trade showing full factor-regression analysis for 13
smart-beta ETFs using the Goldman Sachs QIS framework.

### Charts displayed
| Chart | Data source |
|-------|------------|
| Price History (area) | yfinance monthly adjusted-close, normalised to base 100 |
| Factor Loadings (horizontal bar) | Full-sample OLS with Newey-West HAC SEs |
| Rolling 36-Month Beta (line) | 36-month rolling OLS windows, insignificant windows in red |
| Factor Correlation Matrix (SVG heatmap) | 9×9 correlation matrix, blue→white→red diverging scale |

### Factor universe (9 factors)
`MKT  SMB  HML  MOM  BAB  QMJ  RMW  CARRY  ILLIQ`

Sources: Ken French library (direct ZIP), FRED API, yfinance.

### Files

#### `etf-analysis/smart_beta_checks_comprehensive.py`
Your original analysis script, copied into the repo with one change:
```python
# Before (relative to CWD — breaks when called from another directory)
OUTPUT_DIR = Path("gs_smartbeta_output")

# After (always writes next to the script itself)
OUTPUT_DIR = Path(__file__).parent / "gs_smartbeta_output"
```

#### `etf-analysis/smart_beta_service.py`
Service layer that imports from the comprehensive script directly:
```python
from smart_beta_checks_comprehensive import (
    ETF_CONFIGS, FACTOR_LIST, DataLoader,
    run_factor_regression, run_rolling_regression,
)
```

Adds:
- **Parquet cache** — `cache/factors.parquet`, `etf_returns.parquet`,
  `etf_prices.parquet`, `factor_corr.parquet`, `meta.json`
- **Cache TTL** — 24 h (override with `SMART_BETA_CACHE_TTL` env var)
- **`get_available_etfs()`** — returns list of ETF metadata
- **`analyze(tickers)`** — runs Check 1 + Check 2, returns JSON-serialisable dict

Cache makes second+ calls near-instant (~0.1 s) vs first-call download (~30 s).

#### `etf-analysis/run_analysis.py`
CLI entry point spawned by the Next.js API route:
```bash
python3 run_analysis.py USMV MTUM   # → JSON to stdout, logs to stderr
```

#### `app/api/analysis/smart-beta/route.ts`
Replaced HTTP proxy (old: `→ uvicorn → Python`) with direct subprocess:
```
GET /api/analysis/smart-beta?tickers=USMV,MTUM
  → spawn python3 etf-analysis/run_analysis.py USMV MTUM
  → capture stdout → parse JSON → return to client
  (3-minute timeout for first-call data download)
```

#### `app/trade/analysis/page.tsx`
React page with:
- ETF selector dropdown (13 ETFs from `GET /api/analysis/smart-beta/etfs`)
- Four Recharts/SVG charts (see table above)
- `CorrelationHeatmap` — custom SVG component, 46 px cells, diverging colour scale

#### `components/app-sidebar.tsx`
Added **Analysis** nav item under Trade section with `BarChart2` icon.

---

## 7. Startup — Removing uvicorn

### Before
```json
"dev": "concurrently ... \"next dev\" \"uvicorn server:app --reload --port 8000 --app-dir router\""
```
- Two processes had to start cleanly
- Port 8000 conflicts from stale sessions caused `fetch failed` errors
- ROUTER_URL env var had to be set for the proxy to work

### After
```json
"dev": "next dev"
```
- Single process — no port conflicts, no stale servers
- Python runs on-demand as a subprocess for each request
- Subprocess output (logs) goes to stderr; Next.js ignores it

### Files changed
| File | Change |
|------|--------|
| `package.json` | `dev` / `start` scripts simplified to just `next dev` / `next start` |
| `.env.local` | `ROUTER_URL` removed |
| `app/api/chat/route.ts` | Removed HTTP proxy path; uses `child_process.spawn` for routing |
| `app/api/analysis/smart-beta/route.ts` | Replaced `fetch(ROUTER_URL/smart-beta)` with `spawn(python3 run_analysis.py)` |
| `router/router_cli.py` | New — CLI wrapper for router model (subprocess target) |
| `etf-analysis/run_analysis.py` | New — CLI entry point for smart beta (subprocess target) |

### Restarting the dev server

If `npm run dev` fails because port 3000 is already in use, kill the stale
process first then restart:

```bash
# Kill whatever is holding port 3000, then start fresh
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev
```

Or if you prefer to target Next.js by name:

```bash
pkill -f "next dev" 2>/dev/null; npm run dev
```

---

## 8. Environment Variables

All variables live in one file: `.env.local` (shared by Next.js; Python reads
it via `python-dotenv` when running `router/server.py` standalone).

```bash
# Alpaca Paper Trading
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# Optional — Smart Beta cache TTL override (seconds, default 86400)
# SMART_BETA_CACHE_TTL=86400
```

`ROUTER_URL` was removed — it is no longer needed.

---

## 9. File Tree

```
deep-learning-week/
├── app/
│   ├── api/
│   │   ├── alpaca/
│   │   │   ├── account/route.ts
│   │   │   ├── bars/[symbol]/route.ts
│   │   │   ├── orders/route.ts
│   │   │   ├── orders/[orderId]/route.ts
│   │   │   ├── positions/route.ts
│   │   │   └── sessions/route.ts
│   │   ├── analysis/
│   │   │   └── smart-beta/route.ts      ← subprocess → run_analysis.py
│   │   └── chat/route.ts                ← Ollama API + optional router subprocess
│   ├── coaching/page.tsx                ← ChatGPT-style chat UI
│   ├── login/page.tsx                   ← Auth: login
│   ├── register/page.tsx                ← Auth: 4-step wizard
│   ├── trade/
│   │   ├── analysis/page.tsx            ← Smart Beta charts
│   │   ├── sim/page.tsx                 ← Alpaca paper trading
│   │   └── page.tsx
│   ├── layout.tsx                       ← AuthProvider wrapper
│   └── page.tsx
│
├── components/
│   ├── auth/
│   │   └── RegisterWizard.tsx
│   ├── app-sidebar.tsx                  ← Analysis nav item added
│   └── dashboard-shell.tsx              ← Auth guard added
│
├── contexts/
│   └── AuthContext.tsx                  ← Auth state + localStorage
│
├── etf-analysis/
│   ├── smart_beta_checks_comprehensive.py   ← your script (OUTPUT_DIR fix only)
│   ├── smart_beta_service.py                ← caching + JSON serialisation
│   ├── run_analysis.py                      ← CLI entry point for subprocess
│   └── cache/                               ← parquet cache (gitignored)
│
├── router/
│   ├── bootstrap_labels.py     ← auto-label training data with Ollama
│   ├── prepare_data.py         ← tokenise + train/val split
│   ├── train.py                ← fine-tune distilbert
│   ├── router.py               ← inference
│   ├── router_cli.py           ← CLI subprocess target for chat route
│   ├── server.py               ← standalone FastAPI server (optional)
│   └── requirements.txt
│
├── .env.local                  ← all secrets (one file)
├── .gitignore                  ← etf-analysis/cache/, router/models/
├── next.config.mjs
└── package.json                ← "dev": "next dev"  (no concurrently)
```

# Start Documentation

This guide gets the project running locally with the current split Python dependencies.

## 1. Prerequisites

- Node.js 20+ and npm
- Python 3.10+ and `pip`
- Ollama installed (for local LLM features)

## 2. Go to project directory

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026
```

## 3. Install Node dependencies

```bash
npm install
```

## 4. Set up Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r router/requirements.txt
pip install -r ml-development/etf-analysis/requirements.txt
pip install -r ml-development/rag-pipeline/requirements.txt
pip install -r ml-development/interview-pipeline/requirements.txt
```

Notes:
- `router/requirements.txt` — query-router + Smart Beta dependencies.
- `ml-development/etf-analysis/requirements.txt` — ETF factor analysis (numpy, pandas, statsmodels, yfinance, tabulate).
- `ml-development/rag-pipeline/requirements.txt` — PDF RAG dependencies (faiss-cpu, LangChain, sentence-transformers, openai).
- `ml-development/interview-pipeline/requirements.txt` — interview pipeline (openai, pdfplumber).

Alternative (installs every `requirements.txt` in this repo):

```bash
find . -name "requirements.txt" -type f -print0 | xargs -0 -I{} pip install -r "{}"
```

## 5. Configure environment variables

Copy and edit env values:

```bash
cp .env.local.example .env.local
```

Minimum for local AI coaching:
- `OLLAMA_HOST`
- `OLLAMA_MODEL`

If needed, pull the default model:

```bash
ollama pull llama3.2
```

## 6. Start the app

Standard dev mode:

```bash
npm run dev
```

App URL:
- http://localhost:3000

Optional: start Ollama + Next.js together:

```bash
npm run dev:all
```

## 7. Useful commands

- Build production bundle:
```bash
npm run build
```

- Run lint:
```bash
npm run lint
```

- Run RAG CLI directly (after venv activation):
```bash
python3 ml-development/rag-pipeline/rag_cli.py index --file resume.txt --index-dir /tmp/rag_index
python3 ml-development/rag-pipeline/rag_cli.py query --question "Summarize this resume" --index-dir /tmp/rag_index
```

## 8. Restarting the dev server

If port 3000 is already in use, kill the stale process before restarting:

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev
```

Or by process name:

```bash
pkill -f "next dev" 2>/dev/null; npm run dev
```

## 9. Troubleshooting

- `ModuleNotFoundError: faiss`
  - Ensure venv is active and install:
    ```bash
    pip install -r ml-development/rag-pipeline/requirements.txt
    ```

- Missing package from ETF analysis features
  - Ensure venv is active and install:
    ```bash
    pip install -r ml-development/etf-analysis/requirements.txt
    ```

- Missing package from interview features
  - Ensure venv is active and install:
    ```bash
    pip install -r ml-development/interview-pipeline/requirements.txt
    ```

- Ollama connection errors
  - Check Ollama server:
    ```bash
    ollama serve
    ```
  - Confirm `.env.local` uses the correct `OLLAMA_HOST` (default: `http://localhost:11434`).

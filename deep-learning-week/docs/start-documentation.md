# Start Documentation

This guide gets the project running locally with the current split Python dependencies.

## 1. Prerequisites

- Node.js 20+ and npm
- Python 3.10+ and `pip`
- Ollama installed (for local LLM features)

## 2. Go to project directory

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week
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
pip install -r rag-pipeline/requirements.txt
```

Notes:
- `router/requirements.txt` contains query-router + Smart Beta dependencies.
- `rag-pipeline/requirements.txt` contains PDF RAG dependencies (including `faiss-cpu`).

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
python3 rag-pipeline/rag_cli.py index --file resume.txt --index-dir /tmp/rag_index
python3 rag-pipeline/rag_cli.py query --question "Summarize this resume" --index-dir /tmp/rag_index
```

## 8. Troubleshooting

- `ModuleNotFoundError: faiss`
  - Ensure venv is active and install:
    ```bash
    pip install -r rag-pipeline/requirements.txt
    ```

- Ollama connection errors
  - Check Ollama server:
    ```bash
    ollama serve
    ```
  - Confirm `.env.local` uses the correct `OLLAMA_HOST` (default: `http://localhost:11434`).

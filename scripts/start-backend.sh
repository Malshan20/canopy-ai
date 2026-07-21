#!/usr/bin/env bash
# Starts the CanoryAI FastAPI backend from anywhere in the repo.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
  echo "No virtualenv found — creating one at backend/venv ..."
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

if [ ! -f ".env" ]; then
  echo "No backend/.env found — copying backend/.env.example."
  echo "Edit backend/.env and set GROQ_API_KEY / GEMINI_API_KEY / GFW_API_KEY / DATABASE_URL"
  echo "before uploading real documents. DATABASE_URL must point at a running PostgreSQL"
  echo "instance — see backend/README.md 'Database (required as of Phase 5)'."
  cp .env.example .env
fi

echo "Applying database migrations (alembic upgrade head) ..."
alembic upgrade head

exec uvicorn main:app --reload --port 8000

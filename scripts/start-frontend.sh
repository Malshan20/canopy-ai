#!/usr/bin/env bash
# Starts the CanoryAI Next.js frontend from anywhere in the repo.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "No node_modules found — running npm install ..."
  npm install
fi

if [ ! -f ".env.local" ]; then
  echo "No frontend/.env.local found — copying frontend/.env.local.example."
  cp .env.local.example .env.local
fi

exec npm run dev

# CanoryAI

AI-powered EUDR (EU Deforestation Regulation) supply-chain compliance
platform — monorepo containing both the backend and frontend in one
codebase for easy shipping.

```
canopyai-platform/
├── backend/     # FastAPI service: document AI, compliance engine, DDS XML, Audit Vault (PostgreSQL)
├── frontend/    # Next.js 16 app: upload UI, results dashboard, audit trail, application shell
├── scripts/     # Convenience start scripts for local development
└── README.md    # You are here
```

Each half has its own detailed README:

- [`backend/README.md`](backend/README.md) — architecture, pipeline, Audit Vault, error handling
- [`frontend/README.md`](frontend/README.md) — architecture, design notes, shadcn/ui components, testing guide

This file covers only what you need to get both running together.

---

## Quick start

**Requirements:** Python 3.13+, Node.js 20+, PostgreSQL 16+, a Groq API key,
a Gemini API key, a Global Forest Watch API key.

```bash
# 0. One-time: create the database and app role (see backend/README.md for details)
sudo -u postgres psql -c "CREATE DATABASE canopyai;"
sudo -u postgres psql -c "CREATE USER canopyai_app WITH PASSWORD 'change_me';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE canopyai TO canopyai_app;"
sudo -u postgres psql -d canopyai -c "GRANT ALL ON SCHEMA public TO canopyai_app;"

# Terminal 1 — backend (http://localhost:8000)
./scripts/start-backend.sh

# Terminal 2 — frontend (http://localhost:3000)
./scripts/start-frontend.sh
```

The scripts create a virtualenv / run `npm install` on first run, copy
`.env.example` files if missing, run `alembic upgrade head` to set up the
Audit Vault schema, and start both dev servers with reload enabled. Open
**http://localhost:3000** — that's the whole app.

Before uploading real documents, set your real keys in `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GFW_API_KEY=your_gfw_api_key_here
DATABASE_URL=postgresql+asyncpg://canopyai_app:change_me@localhost:5432/canopyai
```

Prefer Docker for the database? `docker compose up db` starts just
PostgreSQL (see the root `docker-compose.yml`) — everything else still runs
via the scripts above.

### Manual setup (equivalent, without the scripts)

```bash
# Backend
cd backend
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit in your API keys and DATABASE_URL
alembic upgrade head   # create the audit_log table + its immutability trigger
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

---

## How the two halves connect

The frontend talks to the backend over plain HTTP — there is no shared
build step or server-side proxy. The only two things wiring them together
are:

1. **`frontend/.env.local`** → `NEXT_PUBLIC_API_URL=http://localhost:8000`
   (read in `frontend/constants/config.ts`)
2. **`backend/main.py`** → `CORSMiddleware` allowing the frontend's origin
   (`http://localhost:3000`) — already configured in this repo. See
   `backend/README.md` → *FastAPI CORS configuration* if you ever remove
   and need to re-add it, or need to add a production origin.

Because of this clean separation, the two halves can be deployed
independently (e.g. backend on a container platform, frontend on Vercel)
just by changing `NEXT_PUBLIC_API_URL` and the CORS allow-list — no
code changes required on either side.

---

## Testing the full flow

1. Start both servers as above.
2. Go to `http://localhost:3000`.
3. Upload a `.zip` containing a few `.jpg` / `.png` / `.pdf` files.
4. Watch the AI pipeline run, then land on the results dashboard.

See `frontend/README.md` → *Testing the upload flow end-to-end* for a full
walkthrough, including how to deliberately trigger and observe each error
state (backend down, CORS misconfigured, invalid file, oversized file,
unknown shipment).

---

## Repository conventions

- Keep backend and frontend fully independent: no imports across the
  `backend/` ↔ `frontend/` boundary, no shared `node_modules`/`venv`.
  They communicate only over HTTP, as they would across a real network
  boundary in production.
- `backend/app/schemas/*.py` and `frontend/types/shipment.ts` describe the
  same contract by hand. If you change one, change the other — there's no
  codegen step yet linking them (a natural next step once the API surface
  grows beyond this single endpoint).
- New backend endpoints go under `backend/app/api/v1/`; new frontend pages
  go under `frontend/app/`, following the existing pattern of thin
  routes/pages backed by real logic in `services/`.

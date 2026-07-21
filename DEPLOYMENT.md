# CanoryAI — Production Deployment Guide

This is the complete path from a clean GitHub repository to a fully
operational production deployment: Next.js on Vercel, FastAPI as a Docker
container, Supabase for database + auth, and the external AI/satellite
APIs. Every environment variable, config file, and verification step is
listed — a new developer should be able to follow this start to finish.

```
Internet
     │
     ▼
 Vercel (Next.js frontend)
     │  HTTPS, JWT in Authorization header
     ▼
 Docker container (FastAPI backend)
     │
     ├──────────────► Supabase PostgreSQL (DATABASE_URL, direct connection)
     ├──────────────► Supabase Auth (JWT verification, SUPABASE_JWT_SECRET)
     └──────────────► External APIs: Groq, Gemini, Global Forest Watch
```

**One honest architecture note up front:** this backend talks to
PostgreSQL *directly* (`DATABASE_URL`, via the dedicated `canopyai_app`
role from the Phase 6 migration) and verifies Supabase JWTs locally
(`SUPABASE_JWT_SECRET`) — it does not use the Supabase JS/Python client or
a `SUPABASE_SERVICE_ROLE_KEY` anywhere today, because it never calls
Supabase's REST or Storage APIs. If you add Supabase Storage later (e.g.
to retain original uploaded documents for audit purposes — currently they
exist only transiently on disk during processing, see
`backend/app/services/zip_service.py`), that's when a service role key
would actually enter the picture. This guide reflects what the code
actually does, not what a generic Supabase project template assumes.

---

## Part 1 — Environment variable checklist

### Frontend (Vercel) — all `NEXT_PUBLIC_*`, safe to expose in the browser

| Variable | Why it's public |
|---|---|
| `NEXT_PUBLIC_API_URL` | Just a URL — the backend's own CORS/auth is what actually protects it, not keeping this secret. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's public endpoint — required for any client to reach Supabase Auth at all. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Deliberately public by Supabase's own design — it identifies the *project*, not a privileged caller. Real authorization happens via Row Level Security on the database (see Phase 6), not by keeping this key secret. |

**Why `NEXT_PUBLIC_` matters mechanically:** Next.js inlines any
`NEXT_PUBLIC_*` variable into the client-side JavaScript bundle *at build
time*. Anything without that prefix stays server-only and is never sent to
the browser. This isn't a convention you can bend — a variable either has
the prefix and ends up in the bundle you can literally read in DevTools,
or it doesn't and Next.js won't expose it client-side at all. Never put a
real secret behind `NEXT_PUBLIC_`.

### Backend (Docker host) — private, never exposed to browsers

| Variable | Required | Why it must stay private |
|---|---|---|
| `DATABASE_URL` | ✅ | Full Postgres credentials — direct database access if leaked. |
| `SUPABASE_URL` | ✅ | Not sensitive by itself, but grouped here since it's backend config, not a browser-facing value. |
| `SUPABASE_JWT_SECRET` | ✅ | The key that *verifies* every access token. Leaking this lets an attacker forge a valid session for any user. |
| `GROQ_API_KEY` | ✅ | Billed API key — leaking it lets someone else spend your quota. |
| `GEMINI_API_KEY` | ✅ | Same. |
| `GFW_API_KEY` | ✅ | Same. |
| `FRONTEND_URL` | recommended | Not secret, but must be *your real* production origin(s) — see Part 3. |
| `ALLOWED_HOSTS` | recommended | Same category — configuration, not a secret. |
| `WEB_CONCURRENCY` | optional | Leave at `1` — see the Dockerfile's worker-count comment for why. |
| `LOG_LEVEL` | optional | `INFO` in production; `DEBUG` only for temporary troubleshooting (it logs more request detail). |

None of these ever go in a frontend `.env` file, a client component, or
anywhere `NEXT_PUBLIC_` — they live only in your Docker host's
environment (Railway/Render/Fly.io's dashboard secrets, an ECS task
definition's secrets block, etc.), injected at container runtime, never
baked into the image itself.

---

## Part 2 — Backend: Docker

`backend/Dockerfile` and `backend/.dockerignore` are already
production-hardened:

- Runs as a non-root `appuser` (created explicitly, owns `/app` and the
  temp directory the pipeline writes to).
- Layer-cached dependency install: `requirements.txt` is copied and
  installed *before* the rest of the source, so changing application code
  doesn't invalidate the dependency-install layer.
- `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1` — no stray `.pyc`
  files, and logs appear immediately rather than being buffered.
- `HEALTHCHECK` hits `/health` every 30s.
- `--proxy-headers --forwarded-allow-ips='*'` on the Uvicorn command —
  required so the app correctly sees `https` as the scheme (via
  `X-Forwarded-Proto`) when your platform terminates TLS in front of the
  container, which every platform listed above does. `forwarded-allow-ips='*'`
  is safe specifically *because* the container isn't directly
  internet-reachable on these platforms — only their internal proxy can
  reach it — so there's no untrusted party that could spoof those headers.
- `WEB_CONCURRENCY` defaults to `1` — read the Dockerfile's comment block
  above the `CMD` line before raising it; it's a real architectural
  constraint (in-memory shipment cache), not a conservative placeholder.

Build and run locally to sanity-check before deploying:

```bash
docker build -f backend/Dockerfile -t canopyai-backend backend
docker run -p 8000:8000 --env-file backend/.env canopyai-backend
curl http://localhost:8000/health
```

---

## Part 3 — Backend: CORS & security middleware

`backend/main.py` applies three middleware layers, in this order:

1. **`TrustedHostMiddleware`** — rejects requests with a forged `Host`
   header before anything else runs. Controlled by `ALLOWED_HOSTS`
   (comma-separated). Leave as `*` on platforms that already validate the
   host at their edge (Railway, Render, Fly.io, anything behind an ALB) —
   narrow it explicitly if you're ever unsure whether your platform does.
2. **`CORSMiddleware`** — **never** `allow_origins=["*"]`. Origins come
   from `FRONTEND_URL`, comma-separated, so one image can serve both a
   production and a preview/staging frontend:
   ```env
   FRONTEND_URL=https://app.canopyai.com,https://canopyai-git-staging.vercel.app
   ```
   This was verified directly: a request with `Origin: https://evil-site.com`
   gets no `Access-Control-Allow-Origin` header back (browser blocks the
   response), while a configured origin gets it correctly echoed and a
   preflight `OPTIONS` succeeds.
3. **`GZipMiddleware`** — compresses responses over 1KB (the DDS XML
   export and larger audit trails both benefit).

**Other security practices already in place, and why:**

- **HTTPS** — terminated by your platform (Vercel and Railway/Render/Fly
  all provide this automatically for their domains); the backend itself
  doesn't need to handle TLS directly as long as `--proxy-headers` is set
  (see Part 2).
- **Secure cookies** — the frontend never sets its own cookies for backend
  auth; Supabase's `@supabase/ssr` cookies are `httpOnly`/`secure` by
  default when served over HTTPS, which Vercel always does in production.
- **Request size limits** — enforced today by `MAX_ZIP_SIZE_BYTES` at the
  application layer (`backend/app/services/zip_service.py`, streamed and
  rejected mid-upload rather than buffered fully first). Most platforms
  (Railway, Render) also enforce their own upstream request size cap —
  check your platform's docs if you need to raise the default beyond
  ~100MB.
- **Rate limiting** — not implemented. See Optional Recommendations below;
  this is explicitly future work, not an oversight.

---

## Part 4 — Frontend: Vercel

**No `vercel.json` is included, deliberately.** Vercel auto-detects
Next.js with zero configuration, this project needs no rewrites (the
frontend calls the backend directly via `fetch` with a full URL, never
through a Next.js proxy path), and security headers are already set in
`next.config.ts`'s `headers()` function instead — that keeps them
portable to any host, not just Vercel, and avoids maintaining the same
configuration in two places. If a genuine Vercel-specific need comes up
later (a custom redirect, a cron job trigger, etc.), add `vercel.json`
then, for that specific need.

`next.config.ts` now also configures `images.remotePatterns` for
`*.supabase.co/storage/v1/object/public/**`, ready for whenever
Supabase Storage integration lands.

---

## Part 5 — Full deployment workflow

### Supabase

1. Create a production Supabase project at supabase.com.
2. **Project Settings → API**: copy the Project URL, `anon` public key,
   and JWT Secret.
3. **Project Settings → Database**: copy the connection string, convert it
   to the `+asyncpg` driver form CanoryAI's backend expects:
   ```
   postgresql+asyncpg://postgres:[password]@[host]:5432/postgres
   ```
4. Create the dedicated application role (do **not** use the `postgres`
   superuser as your app's runtime credentials):
   ```sql
   CREATE ROLE canopyai_app WITH LOGIN PASSWORD '...';
   GRANT ALL PRIVILEGES ON DATABASE postgres TO canopyai_app;
   GRANT ALL ON SCHEMA public TO canopyai_app;
   ```
   Use *this* role's credentials in your production `DATABASE_URL`, not
   the superuser's.
5. Authentication is already active by default on any Supabase project —
   no extra config needed for email/password auth to work.
6. Storage buckets: not required for the current codebase (see the
   architecture note at the top of this file) — skip unless you've added
   Storage integration yourself.

### Backend

7. Push the latest code to GitHub.
8. Create a new service on your chosen host (Railway/Render/Fly.io/ECS),
   pointing at `backend/Dockerfile` with build context `backend/`.
9. Add every required backend environment variable from Part 1 — at
   minimum `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`,
   `GROQ_API_KEY`, `GEMINI_API_KEY`, `GFW_API_KEY`, plus `FRONTEND_URL`
   once you know your Vercel domain (you can circle back and set this
   after step 15).
10. Deploy.
11. Run migrations against the production database once, from your local
    machine or a one-off deploy task:
    ```bash
    DATABASE_URL=<production URL> alembic -c backend/alembic.ini upgrade head
    ```
12. **Verify**: `curl https://your-backend-host/health` → `{"status":"ok",...}`.

### Frontend

13. Create a new Vercel project, import the same GitHub repo, set the
    **Root Directory** to `frontend`.
14. Add the three frontend environment variables from Part 1.
15. Deploy.
16. Go back to your backend host and set `FRONTEND_URL` to the real
    Vercel URL you just got, then redeploy the backend (CORS needs this
    to actually match).

### End-to-end verification

17. Open the Vercel URL → confirm you land on `/login` (middleware
    redirect working).
18. Sign in → confirm you land back on `/` (the upload page).
19. Confirm the browser's Network tab shows requests to your backend
    succeeding (not blocked by CORS, not 401).
20. Upload a real shipment ZIP → confirm AI extraction, satellite
    verification, and mass balance all complete.
21. Download the DDS XML for a compliant shipment → confirms the full
    pipeline including the compliance gate.
22. Open the shipment's Audit Trail → confirms the append-only ledger and
    RLS-scoped queries both work against production Postgres.
23. From a second account in a *different* organization, confirm you
    cannot access the first shipment's URL (should 404) — this is the
    one check that most directly proves multi-tenant isolation is really
    active in production, not just locally.

---

## Optional recommendations (not implemented — for future phases)

- **GitHub Actions CI/CD**: run `pytest`/`eslint`/`next build` on every PR;
  auto-build and push the Docker image on merge to `main`.
- **Automated Docker image builds**: GitHub Container Registry or Docker
  Hub, tagged by commit SHA, so a deploy is "point the host at a new tag"
  rather than a fresh build.
- **Database backups**: Supabase provides daily backups on paid tiers —
  confirm your plan includes this and knows your retention requirement
  for EUDR audit purposes specifically.
- **Monitoring & alerting**: uptime checks against `/health`; alert on
  sustained 5xx rates or Groq/Gemini/GFW error rates via the existing
  structured logs.
- **Structured logging**: already in place (`backend/app/core/logging.py`)
  — the next step is shipping those logs somewhere queryable (platform
  log drains, or a dedicated log aggregator).
- **Error tracking (Sentry or similar)**: would catch the "unexpected
  exception" path in `app/core/exceptions.py`'s catch-all handler with
  full context, rather than only a server-side log line.
- **Reverse proxy (Nginx/Caddy)**: not needed on Railway/Render/Fly.io
  (they provide this); relevant only for a raw VPS deployment.
- **CDN**: Vercel already CDN-serves the frontend; not applicable to the
  backend's dynamic API responses.
- **Auto-scaling**: straightforward once the in-memory shipment store is
  migrated to Postgres (see the Dockerfile's worker-count note) — until
  then, scaling replicas doesn't behave correctly for shipment retrieval.
- **Redis caching**: would help if GFW/Groq/Gemini rate limits become a
  bottleneck under real load — not needed at current scale.
- **Background task queue**: shipment processing is currently synchronous
  within the request; a queue (Celery/RQ/arq) would let uploads return
  immediately and process asynchronously — worth it once processing time
  or concurrent upload volume grows enough to matter.

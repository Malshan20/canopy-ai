# CanoryAI backend — production container image.
# Build from the repo root:  docker build -f backend/Dockerfile -t canopyai-backend backend
#
# Works with any container host (Railway, Render, Fly.io, ECS, Cloud Run, or
# a plain VPS with `docker run`) — nothing here is platform-specific.

FROM python:3.13-slim

# Prevents Python from writing .pyc files and buffering stdout/stderr, so
# `docker logs` / platform log dashboards show output immediately.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

COPY . .

# Run as a non-root user, and make sure it owns both the app directory and
# the temp directory the app writes uploads/extractions to at runtime
# (see app/core/config.py -> TEMP_DIR_ROOT).
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /tmp/customstree \
    && chown -R appuser:appuser /app /tmp/customstree
USER appuser

# Documents the default port for local `docker run`. Most platforms
# (Railway included) inject a PORT environment variable at runtime and
# expect the app to bind to it, which the CMD below handles.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=3)" || exit 1

# --------------------------------------------------------------------------
# Worker count — read this before changing WEB_CONCURRENCY above 1
# --------------------------------------------------------------------------
# Defaults to a SINGLE worker process. This is deliberate, not an
# oversight: shipment results (the full extraction/compliance payload) are
# currently cached in an in-memory, per-process dict
# (app/services/shipment_store.py), not the database. Running more than
# one worker means requests get round-robined across independent
# processes with independent memory — a shipment saved by worker A's
# in-memory store would 404 when a later request happens to land on
# worker B. See that module's docstring and DEPLOYMENT.md for the full
# explanation and what "safe to scale" looks like once shipment payloads
# are migrated to Postgres (the ownership row already is, as of Phase 6 —
# only the full payload cache remains in-memory).
#
# Once that migration lands, the standard formula applies: WEB_CONCURRENCY
# = (2 x CPU cores) + 1 for an I/O-bound async app like this one. Set it
# via an environment variable at deploy time — never hardcode a worker
# count that assumes a specific host's CPU count, since container hosts
# frequently differ from wherever this image was built.
#
# Prefer horizontal scaling (more container replicas behind your
# platform's load balancer) over multiple workers in a single container
# until then — each replica is a fully independent process either way, so
# this constraint applies equally to both, but replicas are what most
# platforms (Railway, Render, Fly.io) expect you to scale with regardless.
ENV WEB_CONCURRENCY=1

# `scripts/run_migrations.py` runs before the server starts so a code
# deploy that ships a new migration (e.g. document_flags) can never run
# against a database missing its tables. It is deliberately NOT a bare
# `alembic upgrade head`: this project's production database predates
# Alembic tracking (tables exist, `alembic_version` doesn't), and a bare
# upgrade would replay migration #1 into `DuplicateTableError`. The
# script stamps such databases at the last pre-tracking revision first —
# see its module docstring for the full decision table. `|| exit 1`
# makes a failed migration fail the whole deploy loudly instead of
# booting an app that's broken in subtle ways.
CMD ["sh", "-c", "python scripts/run_migrations.py || exit 1; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --proxy-headers --forwarded-allow-ips='*'"]

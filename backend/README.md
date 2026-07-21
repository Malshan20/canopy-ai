# CanoryAI Backend — Document Intelligence, Compliance Engine, DDS Generation, Audit Vault & Multi-Tenancy

AI-powered EUDR (EU Deforestation Regulation) supply chain compliance backend.
Covers ZIP ingestion and Gemini/Groq-based document extraction (Phase 1),
satellite deforestation verification and mass balance validation (Phase 3),
EUDR Due Diligence Statement (DDS) XML generation for TRACES NT submission
(Phase 4), an immutable, append-only compliance audit ledger (Phase 5),
and secure multi-tenant authentication with PostgreSQL Row Level Security
(Phase 6).

## Architecture

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── dependencies.py   # DI providers (settings, http client, DB, store, services)
│   │       └── shipments.py      # POST /upload-zip, GET /{id}/xml, GET /{id}/audit-trail
│   ├── core/
│   │   ├── config.py             # Pydantic Settings (env-driven)
│   │   ├── logging.py            # Structured logging setup
│   │   └── exceptions.py         # Domain exception hierarchy + handlers
│   ├── db/
│   │   └── base.py               # SQLAlchemy declarative Base + async engine/session factory
│   ├── services/
│   │   ├── zip_service.py            # Secure ZIP validation + extraction
│   │   ├── file_scanner.py           # Recursive supported-file discovery
│   │   ├── groq_classifier.py        # Groq classification (openai/gpt-oss-20b)
│   │   ├── gemini_extractor.py       # Gemini vision extraction (gemini-3.5-flash)
│   │   ├── coordinate_parser.py      # Free-text GPS string -> validated lat/lng
│   │   ├── geospatial_service.py     # Global Forest Watch satellite verification (tenacity retries)
│   │   ├── mass_balance_engine.py    # Declared vs. extracted weight validation
│   │   ├── shipment_store.py         # In-memory shipment store (see note below)
│   │   ├── xml_generator.py          # EUDR DDS XML generation (xml.etree.ElementTree)
│   │   ├── xml_data_builder.py       # Translates ShipmentUploadResponse -> xml_generator's dict contract
│   │   ├── audit_service.py          # The ONLY writer to the append-only audit_log table
│   │   └── shipment_processor.py     # Orchestrates the full pipeline end to end
│   ├── schemas/
│   │   ├── documents.py          # DocumentMetadata, ExtractedData, DocumentResult
│   │   ├── compliance.py         # SatelliteVerificationResult, MassBalanceResult, ComplianceSummary
│   │   ├── audit.py              # AuditEventResponse, AuditTrailResponse, canonical action types
│   │   └── responses.py          # ShipmentUploadResponse, ErrorResponse
│   └── models/
│       ├── domain.py             # Internal-only dataclasses (DiscoveredFile, etc.)
│       └── audit_log.py          # AuditLog ORM model — see its docstring for why it's not in domain.py
├── migrations/                   # Alembic — see "Audit Vault" section below
│   ├── env.py
│   ├── audit_log_migration.sql   # Standalone reference copy of the exact SQL, for review
│   └── versions/
├── main.py                       # FastAPI app factory + lifespan + exception wiring
├── Dockerfile
├── alembic.ini
├── requirements.txt
├── .env.example
└── README.md
```

Routes contain **no business logic** — they only translate HTTP in/out.
All orchestration lives in `ShipmentProcessingService`, which runs the full
pipeline: upload -> extraction -> GPS validation -> satellite verification
-> mass balance -> compliance report, storing the completed result so the
DDS XML and audit-trail endpoints can retrieve it by ID afterward. Every
significant step along the way also writes an immutable event to the Audit
Vault (see below) via `AuditService` — this never blocks or fails the main
pipeline even if the database is unreachable.

**Known limitation, by design for this phase:** shipment *results* (the
full extraction/compliance payload) are held in an in-memory
`InMemoryShipmentStore` (see `app/services/shipment_store.py`), not a
database — this doesn't survive a restart or scale across replicas. The
**audit log**, by contrast, is real, persistent PostgreSQL as of Phase 5
(see below) — that distinction matters: the evidence ledger is durable even
though the shipment payload cache it points at currently isn't. Migrating
`InMemoryShipmentStore` to the same database is the natural next step and
requires no interface changes (`save`/`get` is already the right shape).

## Setup

```bash
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set GROQ_API_KEY, GEMINI_API_KEY, GFW_API_KEY, DATABASE_URL
```

### Database (required as of Phase 5)

```bash
# 1. Create the database and a restricted application role
sudo -u postgres psql -c "CREATE DATABASE canopyai;"
sudo -u postgres psql -c "CREATE USER canopyai_app WITH PASSWORD 'change_me';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE canopyai TO canopyai_app;"
sudo -u postgres psql -d canopyai -c "GRANT ALL ON SCHEMA public TO canopyai_app;"

# 2. Point DATABASE_URL at it in .env, then run migrations
alembic upgrade head
```

See "Audit Vault" below for exactly what this migration creates and why —
this was tested against a real local PostgreSQL 16 instance, including
verifying the append-only trigger and role permissions actually reject
UPDATE/DELETE (even as a superuser).

## Run

```bash
uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Endpoint

### `POST /api/v1/shipments/upload-zip`

`multipart/form-data` with a single field `file` containing a `.zip` archive.

```bash
curl -X POST "http://localhost:8000/api/v1/shipments/upload-zip" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@supplier_documents.zip"
```

**Response:**

```json
{
  "shipment_id": "b3f1c2e4-...",
  "documents_processed": 3,
  "documents": [
    {
      "document_id": "a1b2c3d4-...",
      "filename": "weighbridge_001.jpg",
      "classification": "weighbridge_receipt",
      "status": "processed",
      "extracted_data": {
        "farmer_name": "John Doe",
        "crop_weight_kg": 1250.5,
        "date_of_transaction": "2026-03-14",
        "gps_coordinates": "-1.2921, 36.8219",
        "ai_confidence_score": 0.92,
        "supplier_name": null,
        "village": "Kiambu",
        "commodity": "Coffee",
        "receipt_number": "WB-2026-0451",
        "country": "Kenya",
        "language_detected": "en",
        "document_notes": null
      },
      "error_detail": null
    },
    {
      "document_id": "e5f6a7b8-...",
      "filename": "tax_certificate.pdf",
      "classification": "tax_id",
      "status": "processed",
      "extracted_data": null,
      "error_detail": null
    },
    {
      "document_id": "c9d0e1f2-...",
      "filename": "random_note.png",
      "classification": "irrelevant",
      "status": "skipped_irrelevant",
      "extracted_data": null,
      "error_detail": null
    }
  ]
}
```

### `GET /api/v1/shipments/{shipment_id}/xml`

Generates and returns the EUDR DDS XML for a previously-processed shipment,
as a downloadable attachment.

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `operator_name` | yes | Operator/importer legal name |
| `operator_eori` | yes | Operator's EORI number |
| `hs_code` | yes | Customs Harmonized System code |
| `commodity_description` | no | Falls back to the most common `commodity` value across the shipment's extracted documents |
| `country_of_production` | no | Falls back to the most common `country` value across the shipment's extracted documents |

```bash
curl -G "http://localhost:8000/api/v1/shipments/<shipment_id>/xml" \
  --data-urlencode "operator_name=Example Import GmbH" \
  --data-urlencode "operator_eori=EU123456789" \
  --data-urlencode "hs_code=1801" \
  -o eudr_dds_export.xml
```

Returns `application/xml` with `Content-Disposition: attachment` on
success. Only documents whose satellite verification came back
`verified_clean` are included as `<dds:Plot>` geolocations — failed,
pending, or critical-risk coordinates never appear in the statement.

**Compliance gate:** a shipment is rejected with **400** unless mass
balance is compliant *and* every checked coordinate resolved with no
critical or pending results. This is enforced twice — once by the route
before calling the generator, and again defensively inside
`generate_traces_xml` itself — so a "negligible risk" DDS can never be
produced for a shipment that hasn't actually earned that outcome.

| Status | Meaning |
|---|---|
| 404 | No processed shipment found with this ID (never uploaded, or expired from the in-memory store) |
| 400 | Shipment hasn't passed mass balance and/or satellite verification |
| 500 | XML generation failed unexpectedly |

### `GET /api/v1/shipments/{shipment_id}/audit-trail`

Returns the complete, chronological (oldest → newest) compliance history
for a shipment, read directly from the append-only `audit_log` table.

```bash
curl "http://localhost:8000/api/v1/shipments/<shipment_id>/audit-trail"
```

```json
{
  "shipment_id": "f28070bd-ac8d-4630-9478-c789d4447934",
  "events": [
    {
      "id": "f5580be6-3cbb-4716-8614-d991282cec73",
      "timestamp": "2026-07-07T11:25:30.504559Z",
      "actor": "CanoryAI",
      "action_type": "DOCUMENT_EXTRACTED",
      "details": {
        "document_id": "1361d1ca-a0e5-4817-9687-4aaade0ed6ae",
        "filename": "receipt.jpg",
        "document_type": "weighbridge_receipt",
        "fields_extracted": ["farmer_name", "crop_weight_kg", "gps_coordinates", "commodity", "country"],
        "confidence": 0.95
      }
    },
    {
      "id": "82d650f3-1917-423a-8d12-b69ff8923e59",
      "timestamp": "2026-07-07T11:25:30.528552Z",
      "actor": "CanoryAI",
      "action_type": "SATELLITE_CHECK_COMPLETED",
      "details": {
        "latitude": -1.2921, "longitude": 36.8219,
        "status": "verified_clean", "risk": "low",
        "forest_loss_detected": false, "tree_cover_loss_years": [],
        "reason": "No tree cover loss detected after 2020.",
        "cutoff_year": 2020, "duration_seconds": 0.53
      }
    }
  ]
}
```

| Status | Meaning |
|---|---|
| 404 | No processed shipment found with this ID |
| 422 | shipment_id is not a valid identifier |
| 503 | The audit database is temporarily unreachable |

## Audit Vault (Phase 5)

`audit_log` is an **append-only, immutable evidence ledger** — under EUDR
due-diligence requirements, CanoryAI must be able to prove what happened,
when, by whom (or by which AI), and what the outcome was. Once written, a
row can never be edited or deleted, enforced at two independent layers:

1. **Database trigger** (`prevent_audit_log_modification()`) — raises on
   any `UPDATE`/`DELETE` against the table, for *any* role, including a
   superuser. This was verified directly against a real PostgreSQL 16
   instance: connecting as the `postgres` superuser (which bypasses
   `GRANT`/`REVOKE` entirely) and attempting both `UPDATE` and `DELETE`
   were both rejected with `audit_log is an append-only table: ...`.
2. **Role permissions** — the application's runtime role (`canopyai_app`)
   is granted only `SELECT, INSERT`; `UPDATE, DELETE, TRUNCATE` are
   explicitly revoked. Verified the same way: connecting as `canopyai_app`
   and attempting `UPDATE`/`DELETE` both fail with `permission denied for
   table audit_log`.

See `app/models/audit_log.py` for the full model (and why it deliberately
lives outside `app/models/domain.py`), `app/services/audit_service.py` for
the only code path allowed to write to it, and
`migrations/versions/6eeaf452502c_create_audit_log_table.py` /
`migrations/audit_log_migration.sql` for the exact DDL, trigger, and grants
— including production role-setup guidance.

**Where events come from:**

| `action_type` | Emitted by | When |
|---|---|---|
| `DOCUMENT_EXTRACTED` | `shipment_processor.py` | After a successful Gemini extraction |
| `SATELLITE_CHECK_COMPLETED` | `geospatial_service.py` | GFW returned a determination (clean or forest-loss-detected) |
| `SATELLITE_CHECK_FAILED` | `geospatial_service.py` | GFW check couldn't complete (rate limited, timed out, malformed response) |
| `MASS_BALANCE_PASSED` / `MASS_BALANCE_FAILED` | `shipment_processor.py` | After mass balance is computed for the shipment |
| `XML_GENERATED` | `api/v1/shipments.py` (the DDS export route) | After a DDS XML is successfully generated and returned |

`AuditService.log_event` **never raises** — every failure (bad connection,
non-serializable details, constraint violation) is logged and swallowed,
because losing one audit record must never take down the compliance
pipeline it was describing. This was verified by killing the database
mid-run: the upload and XML endpoints both completed successfully (with
audit writes logged as failed, not silently lost — check application logs)
while the database was down, and resumed writing normally once it came
back.

### Running migrations

```bash
alembic upgrade head        # apply all pending migrations
alembic downgrade -1        # roll back the most recent one
alembic upgrade head --sql  # print the exact SQL without executing (review before applying)
```

`migrations/env.py` reads `DATABASE_URL` from the same `Settings`/`.env`
the app uses — never duplicate it in `alembic.ini`.

## Webhooks — the honest "ERP integrations" (Phase 10)

`app/models/webhook.py`, `app/services/webhook_service.py`,
`app/api/v1/webhooks.py`. A real SAP connector and a real NetSuite
connector are different projects, not one feature — what's genuinely
buildable and useful for *any* downstream system is a signed HTTP POST
fired at `shipment.completed`. Verified end-to-end against a real local
HTTP receiver: create a webhook, upload a shipment, and the receiver
independently recomputes the HMAC-SHA256 signature from the shared
secret and confirms it matches (`X-CanoryAI-Signature` header) —
delivery, not just the database CRUD, is proven.

## Original document retention via Supabase Storage (Phase 10)

`app/services/storage_service.py`. **Unlike everything else in this
codebase, this one could not be tested against the real thing** — it
needs a live Supabase project's Storage API and a real
`SUPABASE_SERVICE_ROLE_KEY`, neither available in this environment. The
code is correct against Supabase's documented Storage REST API shape,
but that claim rests on the API contract, not a passing test. It fails
gracefully and loudly (a clear startup warning, `raw_documents.storage_path`
just stays null) if `SUPABASE_SERVICE_ROLE_KEY` isn't configured — see
that module's docstring for the one-time bucket setup required before
this actually stores anything.

## Priority processing queue (Phase 10)

The "Priority processing" feature sold on the Enterprise/Custom pricing
tiers is real — backed by `app/models/processing_job.py`,
`app/services/job_worker.py`, and two new routes on top of the existing
synchronous upload.

| Endpoint | Notes |
|---|---|
| `POST /api/v1/shipments/upload-zip-async` | Persists the upload and enqueues a `processing_jobs` row instead of processing inline. Returns `202` immediately with a job to poll. |
| `GET /api/v1/shipments/jobs/{job_id}` | Poll status: `queued` (with a live `queue_position`) → `processing` → `completed` (with `shipment_id` populated) or `failed` (with `error_detail`). |

**How priority actually works**: a background `JobWorker` runs as a
single asyncio task inside the same process as the API server (started
in `main.py`'s lifespan), claiming jobs via
`SELECT ... FOR UPDATE SKIP LOCKED` ordered by `priority DESC,
created_at ASC` — Enterprise/Custom jobs (`priority=10`) are claimed
ahead of Growth jobs (`priority=0`) queued earlier, but a Growth job is
never starved: within the same priority tier it's still strict FIFO.
Verified end-to-end through the real running app, not just at the SQL
level: a Growth org's job enqueued *first* and an Enterprise org's job
enqueued *15ms later* — the Enterprise job started processing first
(measured, real timestamps), and both completed correctly.

**Why Postgres instead of Redis/Celery**: see
`app/models/processing_job.py`'s module docstring for the full reasoning
— this follows the same "don't add new infrastructure until it's
actually needed" principle as everything else marked
`WEB_CONCURRENCY=1` in this codebase. `SKIP LOCKED` makes claiming safe
even if that were ever raised, just not maximally efficient across
processes — a real queue (Celery/RQ/arq + Redis) is the right next step
if throughput ever actually demands it.

**Why the interactive web app still uses the synchronous endpoint**:
this was a deliberate choice, not an oversight. For a single person
uploading one shipment interactively, synchronous and asynchronous give
an identical result with less complexity synchronously (no polling
latency, no partial-progress UI to build for four coarse states instead
of the existing detailed step-by-step experience). The priority queue's
actual value shows up under concurrent load — many organizations
uploading around the same time — which is the scenario an API
integration or bulk-upload workflow hits, not a single interactive user.
The frontend's upload flow (`hooks/use-file-upload.ts`) was intentionally
left unchanged; `/upload-zip-async` is available today for any API
integration that wants it.

## API Keys — programmatic access (Phase 9)

The "API access" feature sold on the Enterprise/Custom pricing tiers is
real, not aspirational marketing copy — backed by `app/models/api_key.py`,
`app/api/v1/api_keys.py`, and the auth branching in `app/core/auth.py`.

| Endpoint | Notes |
|---|---|
| `POST /api/v1/api-keys` | Creates a key. The plaintext value is returned exactly once, in this response only — only a SHA-256 hash is ever stored. Owner/admin only, interactive session only. |
| `GET /api/v1/api-keys` | Lists keys for the caller's org (masked — `key_prefix` only). Any org member. |
| `DELETE /api/v1/api-keys/{id}` | Revokes a key (sets `revoked_at`, never hard-deletes — the row remains as a permanent record that the key existed and was revoked). Owner/admin only, interactive session only. |

**Using a key**: exactly the same as a Supabase JWT — `Authorization: Bearer cnry_live_...`.
`get_current_user` distinguishes the two by shape (a JWT is three
dot-separated segments; an API key starts with `cnry_live_`) before
parsing either.

**A key's permissions are never frozen at creation time.** Every request
re-resolves the *creating user's current* organization membership and
role — see the api_keys migration's docstring for the full reasoning.
Demote or remove that user and every key they created is immediately and
automatically weakened or disabled, with no separate revocation step
needed.

**Containment**: an API key can never create or revoke other API keys,
even one with effectively owner/admin-derived permissions for everything
else — enforced in the route handlers, independent of and in addition to
the RLS policies.

**Rate limiting**: 60 requests/minute per key (`app/services/rate_limiter.py`),
matching the number advertised on the pricing page — deliberately the
same constant referenced in both places, not two independent numbers that
could drift. This is in-memory, so it shares the exact same
`WEB_CONCURRENCY=1` constraint as `InMemoryShipmentStore` — see that
module's docstring and the Dockerfile's worker-count comment. Only
applies to API-key-authenticated requests, not interactive browser
sessions.

**Honest scope note**: the per-organization "negotiated" rate limit shown
for the Custom tier on the pricing page is not yet independently
configurable — every key currently shares the same global 60/minute
constant regardless of plan. Making this genuinely per-organization is a
small, well-contained follow-up (a `rate_limit_per_minute` column on
`organizations`, read by the limiter instead of the module-level
constant) — flagged here rather than left silently unequal to what's sold.

## Reporting endpoints for the frontend (Phase 8)

Added specifically to back real frontend pages that were previously
"Coming Soon" placeholders with nothing to fetch — every one of these is
RLS-scoped via `rls_session` exactly like every other route:

| Endpoint | Backs |
|---|---|
| `GET /api/v1/shipments` | Shipments list page (paginated, newest first) |
| `GET /api/v1/organizations/me` | Settings → Organization Profile |
| `GET /api/v1/organizations/me/members` | Settings → Team Members (joins `auth.users` for email) |
| `GET /api/v1/organizations/me/summary` | Dashboard summary cards |
| `GET /api/v1/organizations/me/compliance-overview` | Compliance page |
| `GET /api/v1/audit-trail` | The generic (non-shipment-scoped) Audit Trail page |

`shipments` gained several nullable summary columns this phase
(`documents_processed`, `average_confidence`, `critical_farms`,
`commodity`, `country_of_production`, `mass_balance_status`) so these
endpoints have real, durable data to aggregate over without depending on
`InMemoryShipmentStore` still being populated — see
`app/models/shipment.py` and the migration that added them for the full
reasoning, including why they're nullable rather than defaulted to zero.

**Update:** `shipments` also gained a `payload` JSONB column (a follow-up
migration, same phase) storing the complete `ShipmentUploadResponse` —
`GET /shipments/{id}` now reconstructs a shipment's full detail from this
column whenever the faster in-memory cache has expired, belongs to a
different worker process, or the server has restarted. This was verified
directly: a shipment uploaded through one `TestClient`/app instance was
successfully retrieved through a **second, completely fresh instance**
with an empty in-memory store — including confirming cross-tenant
isolation still holds on this new code path (a different organization's
request for the same `shipment_id` still 404s). `InMemoryShipmentStore`
remains as a latency optimization only, never a correctness requirement.

**`active_suppliers` is deliberately absent from the dashboard summary.**
This platform doesn't persist a distinct supplier entity anywhere — see
`app/schemas/shipment_summary.py`'s `DashboardSummary` docstring. Returning
a number for it would mean fabricating one.

## Multi-Tenancy & Security (Phase 6)

Every route requires a Supabase-issued JWT and is scoped to exactly one
organization, enforced at three independent layers — verified end-to-end
against a real PostgreSQL instance, including deliberately trying to break
it (see below):

1. **FastAPI JWT validation** (`app/core/auth.get_current_user`) — verifies
   the `Authorization: Bearer <token>` header's signature and expiry
   (HS256 + `SUPABASE_JWT_SECRET` by default; see that function's
   docstring for the JWKS/RS256 alternative), then resolves the caller's
   organization via a real `user_roles` lookup — never trusts a
   client-supplied organization id.
2. **Organization membership check** — the same lookup; a multi-org user
   selects which organization a request acts as via an `X-Organization-Id`
   header, verified against their real memberships every time.
3. **PostgreSQL Row Level Security** — every query for the request runs
   through an "RLS-scoped session" (`app/core/auth.get_rls_session`) that
   sets `request.jwt.claims` to the *verified* identity from step 1–2, so
   Postgres itself — not application code — decides which rows are
   visible. A route that forgets a `WHERE organization_id = ...` clause
   still cannot leak cross-tenant data.

### Service role vs. user JWT

See `app/core/auth.py`'s module docstring for the full explanation. Short
version: the RLS-scoped session is the default for everything. The
service role (a Postgres role with `BYPASSRLS`, mirroring Supabase's real
`service_role`) is reserved for a narrow, explicit set of system
operations with no single end-user context — Alembic migrations, and the
`SECURITY DEFINER` bootstrap functions in the multi-tenancy migration
(`create_organization_with_owner`, `get_user_organization_id`,
`current_user_role_in_org`). It is never used to serve an ordinary
authenticated API request.

### What this was actually tested against

Real PostgreSQL 16, not a mock — including two real organizations, two
real users, and directly attempting cross-tenant `SELECT`, `UPDATE`, and
`DELETE` through the exact role (`canopyai_app`) the app connects as (no
superuser bypass):

- Bob querying `shipments`/`audit_log` with **no `WHERE` clause at all**
  only ever sees his own organization's rows.
- Alice's `UPDATE`/`DELETE` targeting Bob's shipment by filename affects
  **0 rows** — RLS silently excludes it from her writable row set, it's
  not an error she can probe for.
- The append-only trigger from Phase 5 was independently re-verified to
  still reject `UPDATE`/`DELETE` on `audit_log` even as the `postgres`
  superuser (which bypasses `GRANT`/`REVOKE` but not triggers) — two
  independent reasons the same operation fails.
- The full HTTP stack was exercised with real signed JWTs through
  `TestClient`: no auth header → 401, malformed token → 401, and — the
  critical case — **Bob's authenticated request for Alice's `shipment_id`
  returns 404 on both `/xml` and `/audit-trail`**, indistinguishable from
  that shipment not existing at all.

Two real bugs were caught and fixed by this testing, not just written and
assumed correct: a recursive RLS policy evaluation (`get_user_organization_id()`
querying `user_roles`, whose own policy called `get_user_organization_id()`)
and `AuditService` inserting without ever setting `request.jwt.claims`,
silently relying on there being no RLS at all until `FORCE ROW LEVEL
SECURITY` made that assumption fail loudly. Both are explained in detail
in code comments at the fix site, not just the commit history.

### Local development without a live Supabase project

`scripts/local_dev_auth_stub.sql` reproduces just enough of what a real
Supabase project provisions automatically (`auth.users`, `auth.uid()`, the
`service_role` role) to develop and test RLS policies against a plain
local PostgreSQL instance. **Never run it against a real Supabase
database** — that `auth` schema already exists there. See the script's
own header comment for details.

```bash
psql -d canopyai -f scripts/local_dev_auth_stub.sql
```

### Required environment variables (new in Phase 6)

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here   # Project Settings -> API -> JWT Settings
```

### Setting up a real Supabase project

1. Create a project at supabase.com.
2. Project Settings -> API: copy the Project URL and `anon` key (for the
   frontend's `.env.local`) and the JWT Secret (for the backend's `.env`).
3. Point `DATABASE_URL` at the project's Postgres connection string
   (Project Settings -> Database), using the `+asyncpg` driver prefix.
4. Run `alembic upgrade head` — this creates `organizations`, `user_roles`,
   `shipments`, `raw_documents`, `extracted_supply_chain`, adds
   `organization_id` to `audit_log`, and sets up every RLS policy and
   helper function described above. Real Supabase already has `auth.users`,
   `auth.uid()`, and `service_role` — you do **not** need the local dev
   stub script for a real project.
5. Create your first organization + owner via the
   `create_organization_with_owner(name, user_id)` SQL function (call it
   once via the Supabase SQL editor, or wire up a `/organizations` bootstrap
   endpoint — not included in this phase's scope, see the frontend's note
   on this same gap).

## Pipeline

1. **Validate & persist** — stream the upload to disk (never buffered fully
   in memory), enforcing max size and verifying the ZIP file signature.
2. **Secure extraction** — extract to an isolated temp directory, rejecting
   any member with an absolute path, `..` traversal, or a resolved path
   outside the extraction root (Zip Slip protection). Oversized members are
   skipped, and archives with too many files are rejected outright.
3. **Scan** — recursively walk the extracted tree, keeping only
   `.jpg` / `.jpeg` / `.png` / `.webp` / `.pdf`; everything else (executables,
   nested archives, unknown types) is ignored.
4. **Classify (Groq, `openai/gpt-oss-20b`)** — for PDFs, the first few pages'
   text is extracted (via `pypdf`) and included as evidence; for images,
   classification relies on the filename. The model returns exactly one of
   `weighbridge_receipt` / `land_deed` / `tax_id` / `irrelevant`, and the raw
   output is sanitized/validated before use — an unparsable response safely
   defaults to `irrelevant` rather than crashing the pipeline.
5. **Extract (Gemini, `gemini-3.5-flash`)** — only for `weighbridge_receipt`
   and `land_deed`. PDFs have their first page rendered to a PNG (via
   PyMuPDF) before being sent; images are sent as-is. Gemini is constrained
   to a JSON response schema and instructed to return `null` rather than
   hallucinate.
6. **Respond** — all documents are processed concurrently (bounded by
   `MAX_CONCURRENT_AI_CALLS`), and a single JSON response is returned with a
   per-document status (`processed`, `skipped_irrelevant`,
   `classification_failed`, `extraction_failed`).

## Error handling

Every failure mode maps to a specific exception with an appropriate HTTP
status code (see `app/core/exceptions.py`): invalid/empty/corrupted ZIPs,
unsafe archive contents, oversized uploads, upstream rate limits, upstream
timeouts, and malformed AI responses. A catch-all handler guarantees no
stack trace or internal detail is ever leaked to the client. Per-document
AI failures (classification/extraction) do **not** fail the whole request —
they're captured in that document's `status` and `error_detail` so the rest
of the shipment still processes successfully.

## Notes on model choices

This build intentionally targets `openai/gpt-oss-20b` on Groq and
`gemini-3.5-flash` on Gemini, per project requirements. Swap these via the
`GROQ_MODEL` / `GEMINI_MODEL` environment variables if your account's
available models differ — no code changes required.

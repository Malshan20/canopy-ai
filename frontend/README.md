# CanoryAI — Frontend

An enterprise-grade Next.js frontend for CanoryAI, an AI-powered EUDR (EU
Deforestation Regulation) supply-chain compliance platform. This is the
foundation of the full product: a persistent application shell (sidebar +
header), a fully functional ZIP upload & AI-analysis module, and a
production-quality results dashboard — with every other future module
(Supply Chain, Satellite Verification, Compliance, Audit Trail, Settings)
already wired into navigation as "Coming soon" pages.

This build was verified end-to-end against the real CustomsTree/CanoryAI
FastAPI backend during development: `npm run build`, `eslint`, and a live
upload through the exact request the browser makes (multipart `FormData`
POST with CORS) all pass.

---

## 1. Tech stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** (CSS-first config via `app/globals.css`)
- **shadcn/ui** primitives (hand-wired, "new-york" style, Radix UI under the hood)
- **Lucide React** icons
- **Sonner** for toasts
- **React hooks** for state (no external state library needed yet)

---

## 2. Project structure

```
frontend/
├── app/
│   ├── layout.tsx                  # Root layout: fonts, AppShell, Toaster
│   ├── globals.css                 # Design tokens (Tailwind v4 @theme)
│   ├── page.tsx                    # Upload page — the default landing page
│   ├── not-found.tsx                # Global 404
│   ├── shipments/
│   │   ├── page.tsx                 # "Coming soon" (shipment history/list)
│   │   └── [shipmentId]/page.tsx    # Real results dashboard for a processed shipment
│   ├── dashboard/page.tsx           # "Coming soon"
│   ├── supply-chain/page.tsx        # "Coming soon"
│   ├── satellite-verification/page.tsx  # "Coming soon"
│   ├── compliance/page.tsx          # "Coming soon"
│   ├── audit-trail/page.tsx         # "Coming soon"
│   └── settings/page.tsx            # "Coming soon"
├── components/
│   ├── ui/                # shadcn primitives: button, card, badge, table, dialog, label, etc.
│   ├── layout/             # AppShell, Sidebar, Header, Footer
│   ├── upload/             # Dropzone, FilePreview, ProcessingOverlay, UploadCard
│   ├── results/            # SummaryCards, ComplianceCards, ResultsTable, StatusBadge,
│   │                       # DownloadXmlButton, DownloadXmlDialog, etc.
│   └── shared/             # PageContainer, PageHeader, EmptyState, ErrorCard, ComingSoon
├── hooks/
│   ├── use-file-upload.ts        # Upload lifecycle: validation, progress, API call, navigation
│   ├── use-shipment-store.ts     # Saves a processed shipment to sessionStorage
│   ├── use-stored-shipment.ts    # Hydration-safe read of a saved shipment
│   ├── use-xml-download.ts       # DDS XML download orchestration (Phase 4)
│   └── use-operator-profile.ts   # Remembers operator/HS code details across exports (Phase 4)
├── services/
│   └── api.ts               # uploadShipmentZip(), downloadShipmentXml()
├── lib/
│   ├── utils.ts              # cn(), formatters (file size, duration, confidence, date)
│   ├── validate-upload.ts    # Client-side ZIP + declared-weight validation
│   └── shipment-summary.ts   # Derives dashboard summary metrics
├── types/
│   ├── shipment.ts           # Mirrors the FastAPI backend's Pydantic schemas exactly
│   └── api.ts                # Normalized ApiResult<T> / ApiError types
├── constants/
│   ├── config.ts                 # API_BASE_URL, app name, timeouts
│   ├── upload.ts                  # Size limits, accepted types, processing steps
│   ├── navigation.ts               # Sidebar nav items
│   └── compliance-export.ts        # DDS XML export path/filename, operator profile storage key
└── public/
```

Routes are intentionally split so today's real functionality (Upload →
Results) and tomorrow's functionality (Dashboard, Supply Chain, etc.) share
one navigation model from day one — adding a real page later means
replacing a `ComingSoon` component with real content, not restructuring
routes.

---

## 3. Terminal commands (from a clean machine)

If you're starting completely from scratch (not using the provided
folder), here's every command that produced this project:

```bash
# 1. Create the Next.js project (inside the monorepo, as the frontend/ folder)
npx create-next-app@latest frontend --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*"
cd frontend

# 2. Install Tailwind v4 tooling (create-next-app@latest already includes this,
#    but shown explicitly for clarity)
npm install -D tailwindcss @tailwindcss/postcss postcss

# 3. Initialize shadcn/ui
npx shadcn@latest init

# 4. Install the shadcn/ui components used by this app
npx shadcn@latest add button card badge input separator dropdown-menu \
  tooltip dialog skeleton scroll-area progress alert table sonner

# 5. Install Lucide React icons
npm install lucide-react

# 6. Install Sonner (toast notifications) — included by shadcn add above,
#    but can be installed directly too:
npm install sonner

# 7. Install remaining Radix primitives + utilities used directly
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-progress @radix-ui/react-scroll-area \
  @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tooltip \
  class-variance-authority clsx tailwind-merge tw-animate-css

# 8. Run the development server
npm run dev
```

### Using this exact project instead

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Then open **http://localhost:3000**.

---

## 4. shadcn/ui components used

This project hand-wires the following shadcn/ui primitives (all present
under `components/ui/`, written in the standard shadcn "new-york" style so
`npx shadcn@latest add <name>` will cleanly overwrite them if you prefer to
regenerate from the CLI later):

- `button`
- `card`
- `badge`
- `input`
- `separator`
- `dropdown-menu`
- `tooltip`
- `dialog`
- `skeleton`
- `scroll-area`
- `progress`
- `alert`
- `table`
- `sonner` (toast)

---

## 5. Environment variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

```env
# Base URL of the CanoryAI FastAPI backend (no trailing slash).
NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase project (Project Settings -> API in your Supabase dashboard).
# The anon key is safe to expose client-side — RLS on the backend
# database is what actually enforces access control, not this key.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

These three are read exclusively through `constants/config.ts` / the
`lib/supabase/*` clients — no other file touches `process.env` directly.

---

## 5a. Authentication (Phase 6)

- `middleware.ts` (root) refreshes the Supabase session on every request
  and redirects unauthenticated visitors to `/login` for every route
  except `/login` itself — see `constants/auth.ts` for the exact protected
  list (deliberately includes `/`, the upload page, since it's the most
  sensitive route in the app).
- `lib/supabase/{client,server,middleware}.ts` are the three canonical
  `@supabase/ssr` client variants (browser / Server Components / route
  middleware) — see each file's docstring for when to use which.
- `services/api.ts`'s `authenticatedFetch` attaches the current session's
  access token to every backend request and retries once after a session
  refresh on a 401 before giving up and redirecting to `/login`.
- `app/login/page.tsx` is a standard email/password form; `AppShell`
  renders it without the sidebar/header chrome (see
  `components/layout/app-shell.tsx`'s `CHROMELESS_ROUTES`).

**Known gap, stated plainly:** there is no self-serve "create an
organization" or "invite teammates" UI yet — the backend's
`create_organization_with_owner()` SQL function and the `user_roles`
INSERT policy (owner/admin only) both fully support it, and were tested
directly against Postgres (see `backend/README.md`'s Phase 6 section), but
wiring a frontend flow on top of them wasn't in this phase's scope. Until
that lands, provision the first organization/owner via the Supabase SQL
editor.

**This phase's auth flow itself (the actual OAuth/session round-trip) was
not tested against a live Supabase project** — this sandbox has no network
access to supabase.com. Everything here follows `@supabase/ssr`'s
documented canonical pattern exactly, and `next build`/`eslint` both pass
clean, but treat the login → session → protected-route flow as
code-reviewed rather than execution-verified until you've run it against
a real project.

---

## 6. FastAPI CORS configuration (required)

By default, a browser blocks JavaScript from reading a cross-origin
response unless the server explicitly allows it — and since the frontend
(`http://localhost:3000`) and backend (`http://localhost:8000`) are
different origins during local development, **the upload will fail with an
opaque "Failed to fetch" error until CORS is enabled on the backend.**

Add this to your FastAPI `main.py`, immediately after the app is created
and routes are included:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Why this is required:** the browser sends a preflight `OPTIONS` request
before the real `POST /api/v1/shipments/upload-zip` call. Without
`CORSMiddleware`, FastAPI never responds with the
`Access-Control-Allow-Origin` header the browser is checking for, so the
browser blocks the actual request before your JavaScript ever sees a
response — it looks identical to a network outage from the frontend's
point of view. This is exactly what `services/api.ts`'s `"network"` error
kind message is guiding the developer to check.

When you deploy to production, replace `http://localhost:3000` with your
real frontend origin(s) — never use `allow_origins=["*"]` together with
`allow_credentials=True`; browsers reject that combination anyway.

---

## 7. Running both apps together

See the root [`README.md`](../README.md) for the full monorepo quick start.
Short version:

**Terminal 1 — backend:**

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000** — you'll land directly on the Upload page.

---

## 8. Testing the upload flow end-to-end

1. Prepare a `.zip` archive containing a few `.jpg`/`.png`/`.pdf` files (the
   backend ignores anything else).
2. Go to `http://localhost:3000`.
3. Drag the ZIP onto the dropzone, or click **Browse files**.
4. Confirm the file preview shows the correct name/size, then click
   **Upload & Analyze**.
5. Watch the processing checklist advance while the request is in flight.
6. On success, you're automatically redirected to
   `/shipments/{shipment_id}` showing:
   - Summary cards (total documents, extracted farmers, average
     confidence, processing time, warnings, high-risk documents)
   - A sortable, searchable, paginated results table with confidence
     badges (green ≥ 0.85, amber 0.60–0.85, red < 0.60)
   - Row actions: **View details**, **Flag for review** (placeholder),
     **Download JSON**

**To test failure states:**

- **Backend not running** → stop `uvicorn` and retry an upload. You'll see
  the `ErrorCard` with a "Could not reach the CanoryAI backend…" message
  and a **Retry** button.
- **CORS not configured** → comment out the `CORSMiddleware` block and
  retry. Same network-style error surfaces (this is the browser's
  behavior, not something the frontend can distinguish further — see
  `services/api.ts` for the reasoning).
- **Invalid file** → try uploading a `.pdf` or `.txt` directly; the
  dropzone rejects it client-side before any network request is made.
- **Oversized file** → any file over 50 MB is rejected client-side with a
  friendly message.
- **404 shipment** → visit `/shipments/does-not-exist` directly; you'll see
  the "No results found for this shipment" empty state, since results are
  only available for the browser session that produced them (see the note
  in `hooks/use-shipment-store.ts` about this being a stand-in for a future
  `GET /api/v1/shipments/{id}` endpoint).

## 8a. Testing the DDS XML download (Phase 4)

1. Upload a ZIP that results in a shipment with `compliance.readiness === "ready"`
   (mass balance compliant, no critical or pending satellite verifications).
2. Click **Download EUDR XML** at the top of the results dashboard.
3. Fill in Operator name, EORI, and HS code (Commodity description and
   Country of production are optional — left blank, the backend derives
   them from the shipment's extracted data). These are remembered in this
   browser for next time via `useOperatorProfile`.
4. Click **Generate & Download**. On success you'll see a toast ("XML
   Generated Successfully — Ready for TRACES NT") and the browser will
   download `eudr_dds_export.xml`.

**To test failure states:**

- **Not ready** → if `compliance.readiness !== "ready"`, the button is
  disabled with a tooltip explaining why (hover to see it). This mirrors
  the backend's own gate — a shipment that hasn't passed mass balance and
  satellite verification can never produce a DDS, on either side.
- **Backend can't derive commodity/country** → if a shipment has no
  `commodity`/`country` on any extracted document and you leave those
  fields blank, the backend returns 400 with a message asking you to
  supply them explicitly; the dialog surfaces this via the failure toast.
- **Shipment expired from the in-memory store** → since the backend has no
  persistence yet (see the backend README), a shipment older than the
  store's TTL (or from before a backend restart) returns 404; the toast
  will read "This shipment could not be found."

---

## 8b. Application architecture (Phase 8)

**A note on this section's premise:** Phase 8's brief described the
frontend as "almost the entire application inside `app/page.tsx`" needing
a from-scratch refactor. That wasn't accurate for this codebase —
`app/page.tsx` was already 21 lines delegating to `<UploadCard />`, with
40+ components already separated by feature (`components/upload/`,
`components/results/`, `components/audit/`, etc.) since Phase 2. What
*was* real: the Dashboard, Shipments list, Compliance, Settings, and the
generic (non-shipment-scoped) Audit Trail pages were genuine "Coming Soon"
placeholders with no backend support. This phase built real backend
endpoints for all of them (`backend/app/api/v1/organizations.py`,
`backend/app/api/v1/audit.py`, plus `GET /shipments`) and wired real pages
on top — no mock data anywhere.

**Server vs. Client Components:** Dashboard, Compliance, and the Settings
page's Org Profile / Team Members sections are genuine React Server
Components — fetched directly via `lib/server-api.ts` (a
`cookies()`-based authenticated fetch for the server context, distinct
from `services/api.ts`'s browser-side client) with zero client-side
loading state needed. The Shipments list and Audit Trail pages are Client
Components, because they need real interactivity the server can't provide:
TanStack Query polling, pagination, search/filter, and clickable-row
navigation.

**Real-time synchronization — a second honest note:** CanoryAI's upload
pipeline (`POST /shipments/upload-zip`) is *synchronous* — the request
blocks until AI extraction, satellite verification, and mass balance are
all complete, then returns the final result in one response. There is no
background job queue and no pollable per-shipment status endpoint on the
backend. `hooks/use-shipments-list.ts` (and the dashboard/compliance/
audit-trail hooks) implement what "the user never needs to manually
refresh" honestly means for this architecture: TanStack Query interval
polling of the real list/summary endpoints (15–30s, paused when the tab
isn't focused), so a teammate's upload or a status change shows up without
a reload — not a fake "Queued → Processing → Verifying" progress bar
against an endpoint that doesn't exist.

**Update — this gap is now closed.** A `GET /shipments/{id}` endpoint and
a `shipments.payload` JSONB column (backend) plus
`hooks/use-shipment-detail.ts` (frontend) were added as a same-day
follow-up: the detail page now checks `sessionStorage` first (instant, no
network) and falls back to fetching the full result from the backend —
which itself falls back from its in-memory cache to the durable Postgres
copy — whenever it isn't there. Verified directly: a shipment uploaded
through one backend process was successfully retrieved through a
completely separate, freshly-started process with an empty in-memory
cache, with cross-tenant isolation still intact on that new code path.
Clicking any shipment from the list now works regardless of which
session, device, or server process originally processed it.

---

## 8c. Public marketing homepage (Phase 9) — a routing change worth reading

`/` used to be the authenticated Upload page. It's now CanoryAI's public,
unauthenticated marketing homepage — the brief that drove this asked for
a complete rebuild of `app/page.tsx` as a public-facing site, but that
page was already the app's protected entry point, and a route can't be
both a public marketing page and an authenticated tool at once. Rather
than silently breaking one or the other, this was resolved directly:

- The real Upload page moved to **`/upload`**.
- `constants/auth.ts`'s `PROTECTED_PATH_PREFIXES` no longer includes `/`
  — it includes `/upload` instead.
- `components/layout/app-shell.tsx`'s `CHROMELESS_ROUTES` now includes
  `/` (the marketing page has its own nav/footer, not the dashboard
  sidebar).
- `components/auth/login-form.tsx` now defaults post-login redirects to
  `/dashboard` (not `/`, which is public and wouldn't make sense as a
  "where do I land after signing in" destination).
- Every in-app link that pointed at `/` meaning "the upload page"
  (empty states, the 404 page) was updated to point at `/upload` or a
  generic "back to home" as appropriate.

This was verified end-to-end, not just reasoned about: `GET /upload`
unauthenticated returns a real `307` to `/login?next=%2Fupload`, and the
marketing page at `/` renders fully with no auth check at all.

**Design system:** the marketing page uses its own token namespace,
`.marketing` in `app/globals.css`, entirely separate from the dashboard's
`:root` tokens — different product, different job, deliberately free to
diverge. It also introduces two fonts not used elsewhere in the app
(Manrope for display type, IBM Plex Mono for code/data moments), loaded
alongside the dashboard's Inter in the shared root layout.

**Signature visual device:** the four supplied photographic assets (a
data/AI render, a world-map grid, a satellite radar overlay, a server
room) are deliberately not scattered as generic decoration — every one
appears inside an identically-framed `VerificationWindow` component
(`components/landing/verification-window.tsx`), a recurring "dark window
into verified data" motif that ties directly to the product's actual job:
making an otherwise-invisible supply chain visible and verified.

**Motion split:** GSAP + ScrollTrigger drives the choreographed moments
(hero entrance sequence, the bento grid's coordinated stagger, animated
stat counters); Framer Motion handles the navbar, mobile drawer, hover
states, the pricing toggle, and the FAQ accordion; Lenis provides smooth
scrolling on desktop only (inert on touch devices and for
`prefers-reduced-motion`, both checked directly rather than assumed).

---

## 9. Design notes

- **Palette**: light slate background, white cards, a deep forest-green
  primary (`--primary`), dark slate text, gray borders — plus dedicated
  success/warning/danger/info tokens so status communication (confidence
  badges, alerts, empty/error states) is consistent everywhere. All tokens
  live in `app/globals.css` and are consumed as Tailwind utilities
  (`bg-primary`, `text-success`, `border-danger/20`, etc.) — no hardcoded
  hex values in components.
- **Typography**: Inter throughout. This is a dense, data-heavy enterprise
  tool used for hours at a time, not a marketing site — legibility and
  consistency at small sizes matter more than a decorative display face
  here, so one well-set type family carries the whole product.
- **Signature moment**: the processing checklist (`ProcessingOverlay`) uses
  a vertical step list with a forest-green connector line that grows as
  each stage completes — a quiet, functional nod to CanoryAI's
  growth/canopy metaphor, placed exactly where the user's attention already
  is during the AI pipeline run, rather than as separate decoration.

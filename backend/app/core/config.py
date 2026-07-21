"""
Application configuration module.

Centralizes all environment-driven configuration using Pydantic v2 settings
management. This is the single source of truth for runtime configuration
across the entire application. No module should read os.environ directly;
everything flows through `Settings`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Final

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- Application ---
    APP_NAME: str = "CanoryAI Compliance Engine"
    APP_ENV: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # --- Production deployment (Phase 7) ---
    # Comma-separated list of exact frontend origins allowed to call this
    # API from a browser, e.g. "https://app.canopyai.com,https://canopyai-staging.vercel.app".
    # Never wildcarded in production — see main.py's CORS setup and
    # DEPLOYMENT.md for the full explanation. Defaults to the local Next.js
    # dev server so `docker run`/`uvicorn --reload` work out of the box
    # without requiring this to be set for local development.
    FRONTEND_URL: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Comma-separated list of Host headers this API will accept, enforced
    # by Starlette's TrustedHostMiddleware (see main.py). Guards against
    # HTTP Host header injection attacks when the app sits behind a proxy
    # that doesn't already validate this. "*" (any host) is the safe
    # default for local development and for platforms that already
    # validate the host at their edge (Railway, Render, Fly.io's built-in
    # routing) — set this explicitly in any environment where you can't
    # rely on the platform for that.
    ALLOWED_HOSTS: str = "*"

    @property
    def frontend_origins(self) -> list[str]:
        """Parsed, whitespace-trimmed list of allowed CORS origins."""
        return [origin.strip() for origin in self.FRONTEND_URL.split(",") if origin.strip()]

    @property
    def allowed_hosts(self) -> list[str]:
        """Parsed, whitespace-trimmed list of allowed Host header values."""
        return [host.strip() for host in self.ALLOWED_HOSTS.split(",") if host.strip()]

    # --- AI Providers: Groq (classification) ---
    GROQ_API_KEY: str = Field(..., description="API key for the Groq classification service.")
    GROQ_API_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    GROQ_REQUEST_TIMEOUT_SECONDS: float = 30.0
    GROQ_MAX_RETRIES: int = 2

    # --- AI Providers: Gemini (vision extraction) ---
    GEMINI_API_KEY: str = Field(..., description="API key for Gemini vision extraction.")
    GEMINI_API_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_MODEL: str = "gemini-3.5-flash"
    GEMINI_REQUEST_TIMEOUT_SECONDS: float = 60.0
    GEMINI_MAX_RETRIES: int = 2

    # --- Geospatial verification: Global Forest Watch Data API ---
    GFW_API_KEY: str = Field(
        ..., description="API key for the Global Forest Watch Data API (data-api.globalforestwatch.org)."
    )
    GFW_API_BASE_URL: str = "https://data-api.globalforestwatch.org"
    GFW_DATASET: str = "umd_tree_cover_loss"
    GFW_DATASET_VERSION: str = "latest"
    GFW_REQUEST_TIMEOUT_SECONDS: float = 20.0
    GFW_MAX_RETRIES: int = 3
    MAX_CONCURRENT_SATELLITE_CALLS: int = 8

    # The official EUDR cut-off date is 31 December 2020 — any tree cover
    # loss recorded for a year strictly after this is a compliance risk.
    EUDR_CUTOFF_YEAR: int = 2020

    # --- Real TRACES NT submission (SOAP + WS-Security) ---
    # All optional and unset by default — until an operator actually
    # completes EU registration, real submission is simply unavailable,
    # and every endpoint that needs these fails with a clear, specific
    # "not configured" error rather than a confusing auth failure.
    #
    # HOW TO GET REAL VALUES FOR THESE (there is no shortcut — this is a
    # real-world registration process with the European Commission, not
    # something any amount of code can substitute for):
    #   1. Create an EU Login account (free): https://webgate.ec.europa.eu
    #      — work email, then mandatory two-factor authentication.
    #   2. Register your company as an "Operator" in TRACES NT and get it
    #      validated. For the ACCEPTANCE/test environment specifically,
    #      this currently happens at the Alpha/Acceptance TRACES NT URL
    #      (see TRACES_BASE_URL below) — verify the exact current URL in
    #      TRACES NT's own help pages before relying on this comment,
    #      since this is a live EU system that has changed URLs before
    #      and may again.
    #   3. In your TRACES NT profile, open "Web Services Access" and
    #      activate it — this reveals your real "Authentication Key".
    #      This key is NOT your TRACES login password; it's used only for
    #      the WS-Security digest below. Some EU documentation describes
    #      this as self-service (click "Active"); older documentation
    #      describes requesting it by emailing SANTE-TRACES@ec.europa.eu.
    #      Which applies may depend on your account type — if the
    #      self-service button isn't there, that's who to email.
    #   4. TRACES_USERNAME is your EU Login username (found under "Edit
    #      Profile" → Personal Information), not your email address.
    #   5. Test against acceptance first. Moving to production requires
    #      completing the EU's own conformance tests (multiple, including
    #      submit/retrieve/error-handling) and then requesting separate
    #      production credentials — acceptance credentials do not
    #      automatically grant production access.
    TRACES_USERNAME: str | None = None
    TRACES_AUTHENTICATION_KEY: str | None = None
    # "eudr-test" for acceptance, "eudr-repository" for production — this
    # exact tag is sent as <WebServiceClientId> in every request; using
    # the wrong one is a real, easy mistake (submitting real production
    # data against the test environment, or vice versa).
    TRACES_WEB_SERVICE_CLIENT_ID: str = "eudr-test"
    TRACES_BASE_URL: str = "https://acceptance.eudr.webcloud.ec.europa.eu/tracesnt"
    TRACES_REQUEST_TIMEOUT_SECONDS: float = 30.0

    @property
    def traces_nt_configured(self) -> bool:
        """True only once real credentials exist — see the block above for how."""
        return bool(self.TRACES_USERNAME and self.TRACES_AUTHENTICATION_KEY)

    # --- Compliance Engine: mass balance validation ---
    # Fraction (not percentage) of allowed over-reporting before a shipment
    # is flagged as a mass balance mismatch, e.g. 0.02 == 2%.
    MASS_BALANCE_TOLERANCE_FRACTION: float = 0.02

    # --- Audit Vault: PostgreSQL persistence ---
    # Async SQLAlchemy connection string, e.g.
    # postgresql+asyncpg://user:password@host:5432/canopyai
    #
    # IF DEPLOYING WITH SUPABASE: use the connection POOLER string
    # (Session mode), not the "Direct connection" string. Supabase's
    # direct connection host resolves to an IPv6-only address, and most
    # PaaS providers (Render, Railway, Heroku, and others) don't support
    # outbound IPv6 at all — using it crashes the app at the first real
    # database query with `OSError: [Errno 101] Network is unreachable`,
    # not a credentials or code problem. The pooler host
    # (aws-0-<region>.pooler.supabase.com) resolves over IPv4 and works
    # everywhere. Use Session mode specifically, not Transaction mode —
    # Transaction mode reuses connections across clients in a way that
    # breaks asyncpg's prepared-statement caching.
    DATABASE_URL: str = Field(
        ..., description="Async PostgreSQL connection string for the immutable audit log."
    )
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 5
    DATABASE_ECHO: bool = False

    @field_validator("DATABASE_URL")
    @classmethod
    def _require_asyncpg_driver(cls, value: str) -> str:
        """
        Catch a real, recurring deployment mistake immediately and
        clearly, rather than three layers deep in SQLAlchemy.

        Supabase's dashboard displays connection strings as plain
        `postgresql://...` (driver-agnostic, for generic tools) — copying
        that directly, or copying a fresh string after rotating the
        connecting role, silently drops the `+asyncpg` driver suffix this
        app requires. Without this check, that mistake doesn't surface
        until `create_async_engine` tries to load a driver: since a bare
        `postgresql://` scheme defaults to the *synchronous* psycopg2
        driver (which this project doesn't even install — it's fully
        asyncpg-only), the actual failure is a `ModuleNotFoundError: No
        module named 'psycopg2'` raised from deep inside SQLAlchemy,
        several stack frames away from anything mentioning DATABASE_URL.
        That's exactly what happened in production once already. Failing
        here instead means the very first thing `Settings()` does is
        reject a malformed URL with a message that says precisely what's
        wrong and how to fix it.
        """
        if value.startswith("postgresql+asyncpg://") or value.startswith("postgres+asyncpg://"):
            return value
        if value.startswith("postgresql://") or value.startswith("postgres://"):
            scheme, rest = value.split("://", 1)
            raise ValueError(
                f"DATABASE_URL is missing the '+asyncpg' driver suffix — it starts with "
                f"'{scheme}://' but must start with 'postgresql+asyncpg://'. This is almost "
                f"always caused by copying a connection string straight from Supabase's "
                f"dashboard (which displays a driver-agnostic 'postgresql://' string) without "
                f"adding the driver suffix back in. Fix: 'postgresql+asyncpg://{rest}'."
            )
        raise ValueError(
            "DATABASE_URL must start with 'postgresql+asyncpg://' (this app is asyncpg-only); "
            f"got a value starting with '{value[:20]}...' instead."
        )

    # --- Multi-tenancy: Supabase Auth ---
    SUPABASE_URL: str = Field(
        ..., description="Your Supabase project URL, e.g. https://xxxx.supabase.co"
    )
    SUPABASE_JWT_SECRET: str | None = Field(
        default=None,
        description=(
            "The project's legacy JWT secret (Project Settings -> API -> JWT Settings), used "
            "to verify HS256-signed access tokens locally without a network round trip. "
            "Optional: projects created after ~May 2025 default to asymmetric ES256 signing "
            "keys instead, verified via a JWKS endpoint (see app/core/auth.py's "
            "_decode_supabase_jwt) rather than this secret. Only required if your project "
            "still issues HS256 tokens — if unset and an HS256 token ever arrives, "
            "verification fails with a clear error rather than a startup crash."
        ),
    )
    SUPABASE_JWT_AUDIENCE: str = "authenticated"

    # --- Supabase Storage: original document retention (Phase 10) ---
    # Optional — if unset, the pipeline simply skips storage upload
    # (raw_documents rows are still written, with storage_path left
    # null) rather than failing shipment processing over it. See
    # app/services/storage_service.py's module docstring for the full
    # explanation, including why this needs the service role key (not the
    # anon key) and cannot be verified against a real bucket without one.
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    SUPABASE_STORAGE_BUCKET: str = "shipment-documents"

    # --- Transactional email via Resend (Phase 11) ---
    # See app/services/email_service.py's module docstring for the full
    # reasoning. Optional — cleanly disabled (with a startup warning) if
    # unset, same posture as SUPABASE_SERVICE_ROLE_KEY above.
    RESEND_API_KEY: str | None = None
    RESEND_FROM_ADDRESS: str = "CanoryAI <notifications@canoryai.example.com>"
    # Where new contact-form submissions and customer replies are
    # forwarded for staff to see — a fixed inbox rather than the
    # platform_admins mechanism the separate admin panel project uses,
    # since email notification doesn't need per-admin routing the way
    # in-app UI access does.
    SUPPORT_NOTIFICATION_EMAIL: str = "support@canoryai.example.com"

    # --- Upload / processing constraints ---
    MAX_ZIP_SIZE_BYTES: int = 200 * 1024 * 1024  # 200 MB
    MAX_FILES_PER_ZIP: int = 500
    MAX_SINGLE_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    MAX_CONCURRENT_AI_CALLS: int = 5

    ALLOWED_IMAGE_EXTENSIONS: Final[tuple[str, ...]] = (".jpg", ".jpeg", ".png", ".webp")
    ALLOWED_DOCUMENT_EXTENSIONS: Final[tuple[str, ...]] = (".pdf",)

    # --- Temporary storage ---
    TEMP_DIR_ROOT: Path = Path("/tmp/customstree")

    # --- Logging ---
    LOG_LEVEL: str = "INFO"

    @field_validator("TEMP_DIR_ROOT", mode="before")
    @classmethod
    def _coerce_path(cls, value: str | Path) -> Path:
        return Path(value)

    @property
    def supported_extensions(self) -> tuple[str, ...]:
        """All file extensions accepted for downstream processing."""
        return self.ALLOWED_IMAGE_EXTENSIONS + self.ALLOWED_DOCUMENT_EXTENSIONS


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached Settings singleton."""
    return Settings()

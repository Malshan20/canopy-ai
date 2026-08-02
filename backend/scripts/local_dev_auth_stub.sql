-- ============================================================================
-- LOCAL DEVELOPMENT / TESTING STUB ONLY — DO NOT RUN AGAINST REAL SUPABASE
-- ============================================================================
-- A real Supabase project automatically provisions the `auth` schema,
-- `auth.users` table, and `auth.uid()` function used throughout this
-- codebase's RLS policies. This script exists purely so the multi-tenancy
-- migration and its RLS policies can be developed and verified against a
-- plain local PostgreSQL instance (no live Supabase project required) —
-- the SQL below is a faithful reproduction of Supabase's actual
-- implementation, so policies written and tested against this stub behave
-- identically against real Supabase.
--
-- Running this against an actual Supabase-managed database will fail (the
-- `auth` schema already exists there, owned by Supabase) — that's expected
-- and correct; just skip this script entirely in that environment.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal shape of Supabase's auth.users — only the columns our RLS
-- policies and foreign keys actually reference. Real Supabase's table has
-- many more (email, encrypted_password, etc.) that are irrelevant here.
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text
);

-- Exact reproduction of Supabase's auth.uid(): reads the authenticated
-- user's id out of whichever Postgres session-local setting is populated
-- — either the flattened `request.jwt.claim.sub` (set by PostgREST) or
-- the full `request.jwt.claims` JSON blob (what our own FastAPI backend
-- sets per-request — see app/core/auth.py).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

-- Test helper: simulate "this Postgres session is now authenticated as
-- this user", exactly what our backend's RLS-scoped session dependency
-- does per-request in production. Use via:
--   SELECT auth.login_as('11111111-1111-1111-1111-111111111111');
CREATE OR REPLACE FUNCTION auth.login_as(target_user_id uuid) RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', target_user_id::text, 'role', 'authenticated')::text,
    false
  );
$$;

-- Real Supabase projects come with `service_role` pre-created (a role
-- with the BYPASSRLS attribute, used for privileged backend operations
-- that must legitimately bypass Row Level Security — see the
-- multi-tenancy migration for exactly which operations those are and why).
-- This block only fires locally, where nothing pre-provisions it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH NOLOGIN BYPASSRLS;
    END IF;
END
$$;

GRANT service_role TO canopyai_app;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON auth.users TO service_role;
-- service_role needs CREATE on public to own the SECURITY DEFINER helper
-- functions the multi-tenancy migration creates (see that migration for
-- why they must be owned by service_role specifically).
GRANT CREATE ON SCHEMA public TO service_role;

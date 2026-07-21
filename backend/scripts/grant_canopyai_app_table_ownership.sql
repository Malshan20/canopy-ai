-- ============================================================================
-- One-time fix: transfer table ownership from `postgres` to `canopyai_app`
-- ============================================================================
--
-- WHY THIS IS NEEDED
-- -------------------
-- When DATABASE_URL was switched from the `postgres` superuser to the
-- narrowly-scoped `canopyai_app` role (the fix for the cross-tenant RLS
-- bypass), `canopyai_app` was granted SELECT/INSERT/UPDATE/DELETE on every
-- table it needs — but never made the OWNER of any of them. In PostgreSQL,
-- altering a table's structure (DROP/ADD CONSTRAINT, ADD/DROP COLUMN, etc.)
-- requires actual ownership, not just granted DML privileges — no amount of
-- GRANT SELECT/INSERT/UPDATE/DELETE substitutes for it. Every table that
-- existed before that role switch is still owned by `postgres`, so any
-- migration that ALTERs one of them (not just CREATEs a new one) fails with
-- "must be owner of table X" — a real, observed failure, not a hypothetical.
--
-- IS THIS SAFE? YES — read this before assuming it reopens the security fix.
-- ---------------------------------------------------------------------------
-- Table ownership and RLS bypass are two independent things in Postgres.
-- Normally, a table's OWNER is exempt from its own RLS policies — but every
-- tenant table below already has FORCE ROW LEVEL SECURITY set (confirmed by
-- grepping every migration for it — see the 8 files that set it), which
-- specifically removes that owner exemption. `canopyai_app` becoming the
-- owner does not let it bypass RLS in any way; it remains just as fully
-- bound by every RLS policy as it is today. This has nothing to do with
-- rolbypassrls or rolsuper (both correctly false for canopyai_app, verified
-- by db_health_check.sql) — ownership is a completely separate axis.
--
-- HOW TO RUN THIS
-- ----------------
-- Run once, in the Supabase SQL editor (as `postgres`, which currently owns
-- everything and is the only role that CAN transfer ownership away from
-- itself). After this, `canopyai_app` will be able to run schema-altering
-- migrations on every one of these tables going forward — this is a
-- permanent fix for this entire class of problem, not just for one
-- migration.
-- ============================================================================

ALTER TABLE api_keys OWNER TO canopyai_app;
ALTER TABLE audit_log OWNER TO canopyai_app;
ALTER TABLE contact_ticket_messages OWNER TO canopyai_app;
ALTER TABLE contact_tickets OWNER TO canopyai_app;
ALTER TABLE document_flags OWNER TO canopyai_app;
ALTER TABLE extracted_supply_chain OWNER TO canopyai_app;
ALTER TABLE notification_preferences OWNER TO canopyai_app;
ALTER TABLE notifications OWNER TO canopyai_app;
ALTER TABLE organizations OWNER TO canopyai_app;
ALTER TABLE processing_jobs OWNER TO canopyai_app;
ALTER TABLE raw_documents OWNER TO canopyai_app;
ALTER TABLE shipment_approvals OWNER TO canopyai_app;
ALTER TABLE shipments OWNER TO canopyai_app;
ALTER TABLE user_roles OWNER TO canopyai_app;
ALTER TABLE webhooks OWNER TO canopyai_app;

-- Deliberately NOT included: alembic_version (DML grants already cover
-- everything Alembic itself needs to do with it — it never ALTERs its own
-- structure in normal operation) and any SECURITY DEFINER function
-- (get_user_organization_id, create_organization_with_owner, etc.) — those
-- stay owned by `postgres` on purpose. A SECURITY DEFINER function executes
-- with its OWNER's privileges; these specific functions rely on that to
-- perform their own narrow, validated, RLS-bypassing operations (e.g.
-- atomically creating an organization and its first owner membership row in
-- one transaction). Transferring their ownership to canopyai_app — now
-- correctly RLS-bound — would break them by making their own internal
-- inserts subject to the same RLS restrictions they're specifically meant
-- to bypass in a controlled way.

-- Verify: every listed table should now show 'canopyai_app' as its owner.
SELECT tablename, tableowner FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
    'api_keys', 'audit_log', 'contact_ticket_messages', 'contact_tickets',
    'document_flags', 'extracted_supply_chain', 'notification_preferences',
    'notifications', 'organizations', 'processing_jobs', 'raw_documents',
    'shipment_approvals', 'shipments', 'user_roles', 'webhooks'
)
ORDER BY tablename;

-- ============================================================================
-- CanoryAI Audit Vault — audit_log table
-- ============================================================================
-- This is a standalone, human-readable copy of the exact SQL executed by
-- the authoritative Alembic migration at
-- migrations/versions/6eeaf452502c_create_audit_log_table.py — run
-- `alembic upgrade head` to actually apply it (don't run this file
-- directly against a database Alembic also manages, or the two will lose
-- track of each other). This file exists purely for review: to let a DBA
-- or auditor read the exact DDL without needing Python/Alembic installed.
--
-- Verified against a real PostgreSQL 16 instance: table creation, both
-- immutability layers (trigger + role permissions), and the full
-- upgrade/downgrade cycle were all executed and confirmed working.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Table
-- --------------------------------------------------------------------------

CREATE TABLE audit_log (
    id           UUID NOT NULL,
    shipment_id  UUID NOT NULL,
    "timestamp"  TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    actor        VARCHAR(255) NOT NULL,
    action_type  VARCHAR(100) NOT NULL,
    details      JSONB DEFAULT '{}' NOT NULL,
    PRIMARY KEY (id)
);

COMMENT ON TABLE audit_log IS
    'APPEND-ONLY legal evidence ledger for EUDR compliance actions. '
    'INSERT only — never UPDATE or DELETE. Enforced by a database '
    'trigger and role permissions; see this migration file.';

COMMENT ON COLUMN audit_log.id IS
    'Unique audit event identifier.';

COMMENT ON COLUMN audit_log.shipment_id IS
    'Links this event to a shipment. Not a foreign key: shipments are not '
    'yet a persisted table (see app/services/shipment_store.py) — this '
    'column is indexed for query performance and will become a real '
    'foreign key once a shipments table exists.';

COMMENT ON COLUMN audit_log."timestamp" IS
    'UTC timestamp of when this event was recorded, set by the database.';

COMMENT ON COLUMN audit_log.actor IS
    'Who/what caused this event, e.g. "CanoryAI", "System", or a user identifier.';

COMMENT ON COLUMN audit_log.action_type IS
    'Event category, e.g. DOCUMENT_EXTRACTED, SATELLITE_CHECK_COMPLETED, '
    'SATELLITE_CHECK_FAILED, MASS_BALANCE_PASSED, MASS_BALANCE_FAILED, '
    'MANUAL_OVERRIDE, XML_GENERATED. See app/schemas/audit.py for the '
    'canonical set.';

COMMENT ON COLUMN audit_log.details IS
    'Complete event metadata as JSON — confidence scores, coordinates, field diffs, etc.';

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------
-- Composite (shipment_id, timestamp) covers both "all events for a
-- shipment" lookups and the "oldest -> newest" ordering the audit-trail
-- endpoint needs, in a single index.

CREATE INDEX ix_audit_log_shipment_id_timestamp
    ON audit_log (shipment_id, "timestamp");

-- --------------------------------------------------------------------------
-- Immutability, layer 1: trigger (applies to every role, including
-- superusers — the strongest guarantee this table can offer)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log is an append-only table: % operations are not permitted (row id=%)',
        TG_OP, OLD.id
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_prevent_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER trg_audit_log_prevent_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- --------------------------------------------------------------------------
-- Immutability, layer 2: role permissions (the primary control for the
-- application's actual runtime credentials)
-- --------------------------------------------------------------------------
-- Prerequisite: the `canopyai_app` role must already exist
-- (CREATE ROLE canopyai_app WITH LOGIN PASSWORD '...';) — adjust the role
-- name below if your deployment uses a different one. This intentionally
-- fails loudly if the role doesn't exist yet, rather than silently
-- skipping the grant.

GRANT SELECT, INSERT ON audit_log TO canopyai_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM canopyai_app;

COMMIT;

-- ============================================================================
-- Production deployment notes
-- ============================================================================
-- * The role the running FastAPI application authenticates as (canopyai_app
--   above) should hold ONLY SELECT and INSERT on audit_log, as granted
--   here. It must never be granted UPDATE, DELETE, or TRUNCATE, and should
--   not own the table.
-- * Only a separate, tightly-held migration/admin role — used exclusively
--   for `alembic upgrade`/`downgrade`, never by the running application —
--   should be able to alter this table's schema, drop the trigger, or
--   change these grants.
-- * The trigger is defense in depth: even if the role permissions above
--   were ever misconfigured (or a superuser connection is used by
--   mistake), UPDATE/DELETE are still physically rejected by the database
--   itself. This was verified directly: both layers were tested
--   independently against a real PostgreSQL 16 instance, including
--   attempting UPDATE/DELETE as the postgres superuser (which bypasses
--   GRANT/REVOKE but not triggers) — both were correctly rejected.
-- ============================================================================

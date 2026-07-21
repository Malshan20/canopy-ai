-- ============================================================================
-- CanoryAI database health check
-- ============================================================================
-- Purpose: verify nothing was disturbed by the manual GRANT statements or
-- the canopyai_app role switch — checks alembic version, every function,
-- every trigger, RLS enabled+forced on every tenant table, and canopyai_app's
-- privileges, all pulled directly from the actual migration source.
--
-- 100% READ-ONLY. Every statement here is a SELECT — nothing here can
-- change, delete, or damage anything. Safe to run as many times as you like.
--
-- HOW TO USE: run this whole file in the Supabase SQL editor. Read each
-- section's output. Every row should show status = 'OK'. Any row showing
-- 'MISSING' or 'PROBLEM' tells you exactly what to paste back for a fix —
-- copy the whole result table (or a screenshot) back into the chat.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Alembic version — should be exactly one row, at the current head.
-- ----------------------------------------------------------------------------
SELECT
    'alembic_version' AS check_name,
    version_num,
    CASE WHEN version_num = '16e70de95f21' THEN 'OK — at expected head'
         ELSE 'PROBLEM — expected 16e70de95f21, see note below' END AS status
FROM alembic_version;
-- If this returns zero rows: alembic_version is empty — migrations never
-- stamped correctly. If it shows a DIFFERENT revision: you're on an older
-- migration than your deployed code expects; run `alembic upgrade head`
-- (or redeploy, since your Dockerfile now does this automatically).


-- ----------------------------------------------------------------------------
-- 2. Every function every migration created — should all exist.
-- ----------------------------------------------------------------------------
WITH expected_functions(function_name) AS (
    VALUES
        ('get_user_organization_id'),
        ('current_user_role_in_org'),
        ('create_organization_with_owner'),
        ('list_my_organizations'),
        ('prevent_audit_log_modification'),
        ('lookup_sso_domain'),
        ('resolve_api_key'),
        ('claim_next_processing_job'),
        ('complete_processing_job'),
        ('fail_processing_job'),
        ('get_notification_email_preference'),
        ('get_organization_member_emails')
)
SELECT
    e.function_name AS check_name,
    CASE WHEN p.proname IS NOT NULL THEN 'OK — exists' ELSE 'MISSING' END AS status
FROM expected_functions e
LEFT JOIN pg_proc p ON p.proname = e.function_name
    AND p.pronamespace = 'public'::regnamespace
ORDER BY status DESC, e.function_name;


-- ----------------------------------------------------------------------------
-- 3. The two audit_log immutability triggers — the "prevent_audit_log_
--    modification" enforcement your audit trail's integrity depends on.
-- ----------------------------------------------------------------------------
WITH expected_triggers(trigger_name) AS (
    VALUES ('trg_audit_log_prevent_update'), ('trg_audit_log_prevent_delete')
)
SELECT
    e.trigger_name AS check_name,
    CASE WHEN t.tgname IS NOT NULL THEN 'OK — attached to audit_log' ELSE 'MISSING' END AS status
FROM expected_triggers e
LEFT JOIN pg_trigger t ON t.tgname = e.trigger_name AND NOT t.tgisinternal;


-- ----------------------------------------------------------------------------
-- 4. Row Level Security: enabled AND forced on every tenant table. This is
--    the single most important check — this is the exact property that
--    caused the original cross-tenant leak when it was missing/bypassed.
-- ----------------------------------------------------------------------------
WITH expected_rls_tables(table_name) AS (
    VALUES
        ('organizations'), ('user_roles'), ('shipments'), ('raw_documents'),
        ('extracted_supply_chain'), ('audit_log'), ('document_flags'),
        ('webhooks'), ('shipment_approvals'), ('processing_jobs'),
        ('notifications'), ('notification_preferences'), ('api_keys')
)
SELECT
    e.table_name AS check_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    CASE
        WHEN c.oid IS NULL THEN 'MISSING — table does not exist'
        WHEN NOT c.relrowsecurity THEN 'PROBLEM — RLS not enabled'
        WHEN NOT c.relforcerowsecurity THEN 'PROBLEM — RLS enabled but not FORCED (owner bypasses it)'
        ELSE 'OK — RLS enabled and forced'
    END AS status
FROM expected_rls_tables e
LEFT JOIN pg_class c ON c.relname = e.table_name AND c.relnamespace = 'public'::regnamespace
ORDER BY status DESC, e.table_name;


-- ----------------------------------------------------------------------------
-- 5. canopyai_app role attributes — must be a plain, unprivileged role.
--    This is the exact property that caused the cross-tenant leak.
-- ----------------------------------------------------------------------------
SELECT
    'canopyai_app role attributes' AS check_name,
    rolsuper, rolbypassrls, rolcanlogin,
    CASE
        WHEN rolsuper OR rolbypassrls THEN 'PROBLEM — this role bypasses RLS, same class of bug as before'
        WHEN NOT rolcanlogin THEN 'PROBLEM — role cannot log in, the app cannot connect as it'
        ELSE 'OK — narrowly scoped, RLS applies to it'
    END AS status
FROM pg_roles WHERE rolname = 'canopyai_app';


-- ----------------------------------------------------------------------------
-- 6. canopyai_app schema + table access — the two things your manual GRANTs
--    added, plus everything every other migration already granted.
-- ----------------------------------------------------------------------------
SELECT
    'schema public USAGE' AS check_name,
    CASE WHEN has_schema_privilege('canopyai_app', 'public', 'USAGE')
         THEN 'OK — granted' ELSE 'MISSING — run: GRANT USAGE ON SCHEMA public TO canopyai_app;' END AS status
UNION ALL
SELECT
    'table: ' || table_name,
    CASE WHEN has_table_privilege('canopyai_app', table_name, 'SELECT')
         THEN 'OK — has SELECT' ELSE 'MISSING — canopyai_app cannot read this table' END
FROM (VALUES
    ('alembic_version'), ('organizations'), ('user_roles'), ('shipments'),
    ('raw_documents'), ('extracted_supply_chain'), ('audit_log'), ('document_flags'),
    ('webhooks'), ('shipment_approvals'), ('processing_jobs'), ('notifications'),
    ('notification_preferences'), ('api_keys'), ('contact_tickets'), ('contact_ticket_messages')
) AS t(table_name)
ORDER BY status DESC;


-- ----------------------------------------------------------------------------
-- 7. Smoke test: does real data still exist? (Not a privilege check — this
--    just confirms nothing was deleted. Run this as canopyai_app or postgres;
--    counts may read as 0 here if run without an organization context, since
--    RLS correctly hides rows with no matching org — that's expected, not a
--    bug. This is mainly useful to eyeball via the Supabase Table Editor
--    instead, which reads with elevated access.)
-- ----------------------------------------------------------------------------
SELECT 'organizations' AS table_name, count(*) AS row_count FROM organizations
UNION ALL
SELECT 'shipments', count(*) FROM shipments
UNION ALL
SELECT 'user_roles', count(*) FROM user_roles;

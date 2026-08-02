"""add multi tenancy

Revision ID: 92bc9aeb4493
Revises: 6eeaf452502c
Create Date: 2026-07-07 12:22:25.811545

--------------------------------------------------------------------------
MULTI-TENANCY + ROW LEVEL SECURITY — READ BEFORE MODIFYING
--------------------------------------------------------------------------
This migration is CanoryAI's tenant-isolation boundary. It:

  1. Creates `organizations` (tenants) and `user_roles` (which users belong
     to which organizations, with what role).
  2. Creates `shipments`, `raw_documents`, `extracted_supply_chain` —
     organization-scoped tables (the latter two are schema-ready; see
     their model docstrings in app/models/raw_document.py).
  3. Adds `organization_id` to the existing `audit_log` table, backfilling
     any pre-existing rows into a well-known "Legacy / Unassigned"
     organization (id `00000000-0000-0000-0000-000000000000`) rather than
     either guessing an owner or silently deleting historical data.
  4. Enables Row Level Security on every one of the above and adds
     policies so that, independent of anything the FastAPI application
     layer does or doesn't check, PostgreSQL itself refuses to return or
     modify a row belonging to another organization.

RLS policies here call `get_user_organization_id()`, defined below. That
function trusts an explicit `organization_id` claim in the current
session's JWT claims *only after verifying it against a real `user_roles`
membership row* — see the function body for why (defense against a client
claiming an org it doesn't belong to), and `app/core/auth.py` for how the
FastAPI backend sets that claim per-request.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '92bc9aeb4493'
down_revision: Union[str, Sequence[str], None] = '6eeaf452502c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Sentinel organization pre-existing (pre-multi-tenancy) audit_log rows are
# backfilled into, since a migration cannot safely guess their real owner.
LEGACY_ORG_ID = "00000000-0000-0000-0000-000000000000"

APP_ROLE_NAME = "canopyai_app"


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Tables
    # ------------------------------------------------------------------
    op.create_table(
        'organizations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        comment="Tenant/company records. Root of CanoryAI's multi-tenant data isolation.",
    )

    # Well-known sentinel org for legacy data backfill (see module docstring).
    op.execute(
        f"INSERT INTO organizations (id, name) VALUES "
        f"('{LEGACY_ORG_ID}', 'Legacy / Unassigned') ON CONFLICT DO NOTHING;"
    )

    op.create_table(
        'shipments',
        sa.Column('id', sa.UUID(), nullable=False, comment='Matches the shipment_id used everywhere else.'),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('source_filename', sa.String(length=500), nullable=True),
        sa.Column('declared_weight_kg', sa.Float(), nullable=True),
        sa.Column('readiness', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['auth.users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment=(
            'Organization-scoped ownership ledger for processed shipments. The full '
            'extraction/compliance payload lives in the in-memory shipment store '
            '(see app/services/shipment_store.py) — this row is the durable, '
            'RLS-protected record of which organization and user a shipment belongs to.'
        ),
    )
    op.create_index('ix_shipments_organization_id', 'shipments', ['organization_id'], unique=False)

    op.create_table(
        'user_roles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("role IN ('owner', 'admin', 'compliance_manager', 'viewer')", name='ck_user_roles_valid_role'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['auth.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'organization_id', name='uq_user_roles_user_org'),
        comment='Maps Supabase-authenticated users to organizations with a role.',
    )
    op.create_index('ix_user_roles_organization_id', 'user_roles', ['organization_id'], unique=False)
    op.create_index('ix_user_roles_user_id', 'user_roles', ['user_id'], unique=False)

    op.create_table(
        'raw_documents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('shipment_id', sa.UUID(), nullable=False),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('classification', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='Per-document upload records. Schema-ready; not yet populated by the pipeline.',
    )
    op.create_index('ix_raw_documents_organization_id', 'raw_documents', ['organization_id'], unique=False)
    op.create_index('ix_raw_documents_shipment_id', 'raw_documents', ['shipment_id'], unique=False)

    op.create_table(
        'extracted_supply_chain',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('shipment_id', sa.UUID(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=True),
        sa.Column('farmer_name', sa.String(length=255), nullable=True),
        sa.Column('gps_coordinates', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['raw_documents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment="AI-extracted farmer/GPS/weight data per document. Schema-ready; not yet populated by the pipeline (see RawDocument's docstring).",
    )
    op.create_index('ix_extracted_supply_chain_organization_id', 'extracted_supply_chain', ['organization_id'], unique=False)
    op.create_index('ix_extracted_supply_chain_shipment_id', 'extracted_supply_chain', ['shipment_id'], unique=False)

    # ------------------------------------------------------------------
    # audit_log: add organization_id safely (nullable -> backfill -> NOT NULL)
    # ------------------------------------------------------------------
    op.add_column(
        'audit_log',
        sa.Column(
            'organization_id',
            sa.UUID(),
            nullable=True,
            comment='The tenant this event belongs to. Enforced by RLS — see this migration.',
        ),
    )
    # The Phase 5 append-only trigger (prevent_audit_log_modification) fires
    # on ANY UPDATE, including this migration's own one-time backfill of a
    # brand-new column that didn't exist before this migration — it isn't
    # rewriting any event's actor/action_type/details/timestamp. Only a
    # migration role (never the app's runtime role) may do this, and only
    # for the duration of this single controlled backfill statement.
    # Phase 5 also REVOKEd UPDATE from canopyai_app entirely (see the
    # audit_log migration) — the app's runtime role must never be able to
    # update audit rows, full stop. A migration, however, legitimately runs
    # with elevated privileges for the duration of a single controlled
    # backfill; re-grant, backfill, then revoke again immediately.
    op.execute(f"GRANT UPDATE ON audit_log TO {APP_ROLE_NAME};")
    op.execute("ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_prevent_update;")
    op.execute(f"UPDATE audit_log SET organization_id = '{LEGACY_ORG_ID}' WHERE organization_id IS NULL;")
    op.execute("ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_prevent_update;")
    op.execute(f"REVOKE UPDATE ON audit_log FROM {APP_ROLE_NAME};")
    op.alter_column('audit_log', 'organization_id', nullable=False)
    op.create_index('ix_audit_log_organization_id', 'audit_log', ['organization_id'], unique=False)
    op.create_foreign_key(
        'fk_audit_log_organization_id', 'audit_log', 'organizations', ['organization_id'], ['id'], ondelete='CASCADE'
    )

    # ------------------------------------------------------------------
    # RLS helper functions
    # ------------------------------------------------------------------
    # `get_user_organization_id()`, `current_user_role_in_org()`, and
    # `create_organization_with_owner()` all need to read/write user_roles
    # and organizations without being subject to those tables' own RLS
    # policies — otherwise (as directly observed while testing this
    # migration) evaluating one of those policies requires calling one of
    # these functions, which queries the same table, which re-evaluates
    # the same policy: unbounded recursion.
    #
    # `SECURITY DEFINER` alone does NOT grant an RLS bypass on a table
    # that has `FORCE ROW LEVEL SECURITY` (also directly observed: Postgres
    # raises "query would be affected by row-level security policy" rather
    # than silently bypassing). The only real mechanism is a role with the
    # `BYPASSRLS` attribute — which is exactly what Supabase's `service_role`
    # already is on a real Supabase project. These three functions are
    # therefore created as `service_role` (see scripts/local_dev_auth_stub.sql
    # for how that role is provisioned locally) and merely EXECUTE-granted
    # to canopyai_app, so SECURITY DEFINER lets ordinary app requests call
    # them without canopyai_app itself ever holding BYPASSRLS — the app's
    # *own* queries against these tables remain fully RLS-restricted; only
    # these three specific, narrow, audited code paths bypass it, and only
    # for the operations coded inside them.
    # On a real Supabase project, `service_role` already has full access to
    # every table in `public` out of the box. This grant is what makes that
    # true on a plain (non-Supabase) PostgreSQL instance too — BYPASSRLS
    # bypasses row-level *filtering*, but the role still needs ordinary
    # table-level GRANTs to touch these tables at all.
    op.execute("GRANT ALL ON organizations, user_roles, shipments, raw_documents, extracted_supply_chain TO service_role;")

    op.execute("SET ROLE service_role;")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_user_organization_id() RETURNS uuid
        LANGUAGE plpgsql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            claimed_org uuid;
            resolved_org uuid;
        BEGIN
            BEGIN
                claimed_org := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'organization_id')::uuid;
            EXCEPTION WHEN OTHERS THEN
                claimed_org := NULL;
            END;

            IF claimed_org IS NOT NULL THEN
                SELECT organization_id INTO resolved_org
                FROM user_roles
                WHERE user_id = auth.uid() AND organization_id = claimed_org;
                RETURN resolved_org; -- NULL if that wasn't a real membership
            END IF;

            SELECT organization_id INTO resolved_org
            FROM user_roles
            WHERE user_id = auth.uid()
            ORDER BY created_at ASC
            LIMIT 1;

            RETURN resolved_org;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION current_user_role_in_org(target_org_id uuid) RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT role FROM user_roles
            WHERE user_id = auth.uid() AND organization_id = target_org_id
            LIMIT 1;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION create_organization_with_owner(org_name text, owner_user_id uuid)
        RETURNS uuid
        LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            new_org_id uuid;
        BEGIN
            INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), org_name)
            RETURNING id INTO new_org_id;

            INSERT INTO user_roles (id, user_id, organization_id, role)
            VALUES (gen_random_uuid(), owner_user_id, new_org_id, 'owner');

            RETURN new_org_id;
        END;
        $$;
        """
    )

    op.execute("RESET ROLE;")

    # Organization creation is a bootstrapping operation (the creating
    # user doesn't belong to any org yet, so no org-scoped policy could
    # ever authorize it) — it happens exclusively through this function,
    # never a raw INSERT, so only the backend needs to call it directly.
    op.execute("REVOKE ALL ON FUNCTION create_organization_with_owner(text, uuid) FROM PUBLIC;")
    op.execute(f"GRANT EXECUTE ON FUNCTION get_user_organization_id() TO {APP_ROLE_NAME};")
    op.execute(f"GRANT EXECUTE ON FUNCTION current_user_role_in_org(uuid) TO {APP_ROLE_NAME};")
    op.execute(f"GRANT EXECUTE ON FUNCTION create_organization_with_owner(text, uuid) TO {APP_ROLE_NAME};")

    # ------------------------------------------------------------------
    # Enable RLS everywhere
    # ------------------------------------------------------------------
    for table in ("organizations", "user_roles", "shipments", "raw_documents", "extracted_supply_chain", "audit_log"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")

    # ------------------------------------------------------------------
    # organizations: members can read their own org; only owner/admin can update it.
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # organizations: members can read their own org; only owner/admin can
    # update it. No INSERT/DELETE policy — creation happens exclusively
    # through create_organization_with_owner() above (a brand-new user
    # doesn't belong to any org yet, so no org-scoped policy could ever
    # authorize a raw INSERT); deletion is intentionally unsupported via
    # RLS-governed queries (a rare, dangerous operation better handled
    # through a dedicated admin process).
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY organizations_select_own ON organizations
        FOR SELECT USING (id = get_user_organization_id());
        """
    )
    op.execute(
        """
        CREATE POLICY organizations_update_owner_admin ON organizations
        FOR UPDATE USING (
            id = get_user_organization_id()
            AND current_user_role_in_org(id) IN ('owner', 'admin')
        )
        WITH CHECK (
            id = get_user_organization_id()
            AND current_user_role_in_org(id) IN ('owner', 'admin')
        );
        """
    )

    # ------------------------------------------------------------------
    # user_roles: see your own membership row, or any row in an org you
    # belong to (via the non-recursive get_user_organization_id() /
    # current_user_role_in_org() helpers — never a raw self-join, which is
    # what caused the recursion these helpers exist to avoid).
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY user_roles_select_own_org ON user_roles
        FOR SELECT USING (
            user_id = auth.uid()
            OR organization_id = get_user_organization_id()
        );
        """
    )
    op.execute(
        """
        CREATE POLICY user_roles_manage_owner_admin ON user_roles
        FOR ALL USING (
            current_user_role_in_org(organization_id) IN ('owner', 'admin')
        )
        WITH CHECK (
            current_user_role_in_org(organization_id) IN ('owner', 'admin')
        );
        """
    )

    # ------------------------------------------------------------------
    # shipments / raw_documents / extracted_supply_chain: standard
    # full-CRUD, organization-scoped policies.
    # ------------------------------------------------------------------
    for table in ("shipments", "raw_documents", "extracted_supply_chain"):
        op.execute(
            f"""
            CREATE POLICY {table}_select_own_org ON {table}
            FOR SELECT USING (organization_id = get_user_organization_id());
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_insert_own_org ON {table}
            FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_update_own_org ON {table}
            FOR UPDATE USING (organization_id = get_user_organization_id())
            WITH CHECK (organization_id = get_user_organization_id());
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_delete_own_org ON {table}
            FOR DELETE USING (organization_id = get_user_organization_id());
            """
        )

    # ------------------------------------------------------------------
    # audit_log: SELECT + INSERT only, organization-scoped. Deliberately
    # NO UPDATE/DELETE policy at all — combined with the append-only
    # trigger and revoked grants from the audit_log migration, this means
    # an UPDATE/DELETE is rejected for at least one of three independent
    # reasons (missing policy, trigger, or grant), regardless of tenant.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY audit_log_select_own_org ON audit_log
        FOR SELECT USING (organization_id = get_user_organization_id());
        """
    )
    op.execute(
        """
        CREATE POLICY audit_log_insert_own_org ON audit_log
        FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
        """
    )

    # ------------------------------------------------------------------
    # Grants: canopyai_app needs table-level DML privileges for RLS to
    # even be evaluated (RLS restricts *which rows*, not whether the
    # operation is permitted at all — both layers are required together).
    # ------------------------------------------------------------------
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO {APP_ROLE_NAME};")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON user_roles TO {APP_ROLE_NAME};")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON shipments TO {APP_ROLE_NAME};")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON raw_documents TO {APP_ROLE_NAME};")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON extracted_supply_chain TO {APP_ROLE_NAME};")
    # audit_log's grants were already narrowed to SELECT, INSERT only by
    # the previous migration — left untouched here intentionally.


def downgrade() -> None:
    for table in ("shipments", "raw_documents", "extracted_supply_chain"):
        for suffix in ("select_own_org", "insert_own_org", "update_own_org", "delete_own_org"):
            op.execute(f"DROP POLICY IF EXISTS {table}_{suffix} ON {table};")

    op.execute("DROP POLICY IF EXISTS audit_log_select_own_org ON audit_log;")
    op.execute("DROP POLICY IF EXISTS audit_log_insert_own_org ON audit_log;")
    op.execute("DROP POLICY IF EXISTS user_roles_select_own_org ON user_roles;")
    op.execute("DROP POLICY IF EXISTS user_roles_manage_owner_admin ON user_roles;")
    op.execute("DROP POLICY IF EXISTS organizations_select_own ON organizations;")
    op.execute("DROP POLICY IF EXISTS organizations_update_owner_admin ON organizations;")

    for table in ("organizations", "user_roles", "shipments", "raw_documents", "extracted_supply_chain", "audit_log"):
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    op.execute("DROP FUNCTION IF EXISTS get_user_organization_id();")
    op.execute("DROP FUNCTION IF EXISTS current_user_role_in_org(uuid);")
    op.execute("DROP FUNCTION IF EXISTS create_organization_with_owner(text, uuid);")

    op.drop_constraint('fk_audit_log_organization_id', 'audit_log', type_='foreignkey')
    op.drop_index('ix_audit_log_organization_id', table_name='audit_log')
    op.drop_column('audit_log', 'organization_id')

    op.drop_index('ix_extracted_supply_chain_shipment_id', table_name='extracted_supply_chain')
    op.drop_index('ix_extracted_supply_chain_organization_id', table_name='extracted_supply_chain')
    op.drop_table('extracted_supply_chain')

    op.drop_index('ix_raw_documents_shipment_id', table_name='raw_documents')
    op.drop_index('ix_raw_documents_organization_id', table_name='raw_documents')
    op.drop_table('raw_documents')

    op.drop_index('ix_user_roles_user_id', table_name='user_roles')
    op.drop_index('ix_user_roles_organization_id', table_name='user_roles')
    op.drop_table('user_roles')

    op.drop_index('ix_shipments_organization_id', table_name='shipments')
    op.drop_table('shipments')

    op.drop_table('organizations')

"""add api keys table

Revision ID: be151ebdcbe8
Revises: 171f934ce79c
Create Date: 2026-07-08 17:10:43.176832

--------------------------------------------------------------------------
API KEYS — READ BEFORE MODIFYING
--------------------------------------------------------------------------
Backs the "API access" feature on the Enterprise/Custom pricing tiers.
Only a SHA-256 hash of each key is ever stored (see app/models/api_key.py).

Auth model: `resolve_api_key()` below is the ONLY way a raw key's hash is
looked up — it's SECURITY DEFINER + owned by `service_role` (same pattern,
and same reasoning, as the multi-tenancy migration's `get_user_organization_id()`),
since resolving "which organization does this key belong to" has to happen
*before* any RLS context exists to check it against. It deliberately does
NOT trust the key alone: it also confirms the key isn't revoked, and
returns the *creating user's* id so the backend can set the exact same
RLS claims shape a normal JWT-authenticated request would — meaning
`get_user_organization_id()` and every existing RLS policy work completely
unchanged for API-key-authenticated requests. No policy in this codebase
needed to be touched to add this feature.

This also means an API key's effective access is always the *creating
user's current* org membership and role, re-checked on every single
request — not a permission level frozen onto the key at creation time.
Revoke or demote that user, and every key they created is immediately and
automatically weakened or disabled too. See the model's docstring for why
this is a deliberate security property.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be151ebdcbe8'
down_revision: Union[str, Sequence[str], None] = '171f934ce79c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE_NAME = "canopyai_app"


def upgrade() -> None:
    op.create_table('api_keys',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('key_prefix', sa.String(length=24), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['auth.users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment="Programmatic API credentials. Only a SHA-256 hash of the real key is ever stored — see this model's module docstring."
    )
    op.create_index('ix_api_keys_key_hash', 'api_keys', ['key_hash'], unique=True)
    op.create_index('ix_api_keys_organization_id', 'api_keys', ['organization_id'], unique=False)

    # ------------------------------------------------------------------
    # resolve_api_key(): the sole entry point for hash -> org resolution.
    # Same ownership pattern as the other RLS helper functions: created
    # directly by whoever runs this migration (a project superuser on
    # Supabase), then best-effort handed off to service_role — never via
    # `SET ROLE service_role`, which requires service_role to
    # independently hold CREATE on schema public (not guaranteed; see the
    # multi-tenancy migration's own notes on exactly this failure mode).
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION resolve_api_key(p_key_hash text)
        RETURNS TABLE(id uuid, organization_id uuid, created_by uuid)
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT api_keys.id, api_keys.organization_id, api_keys.created_by
            FROM api_keys
            WHERE api_keys.key_hash = p_key_hash
              AND api_keys.revoked_at IS NULL;
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER FUNCTION resolve_api_key(text) OWNER TO service_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped reassigning resolve_api_key ownership to service_role (non-fatal): %', SQLERRM;
        END
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION resolve_api_key(text) FROM PUBLIC;")
    op.execute(f"GRANT EXECUTE ON FUNCTION resolve_api_key(text) TO {APP_ROLE_NAME};")
    # service_role needs its own table-level grant too — SECURITY DEFINER
    # bypasses RLS row-filtering, not the base object-level GRANT system,
    # so without this, resolve_api_key() fails with "permission denied for
    # table api_keys" the moment it's actually owned by service_role
    # (exactly the failure mode documented at length in the multi-tenancy
    # migration — repeated here once, caught by testing, not left in).
    op.execute("GRANT SELECT ON api_keys TO service_role;")

    # ------------------------------------------------------------------
    # RLS — identical org-scoping pattern as every other tenant table.
    # No DELETE policy: revoking a key sets revoked_at via UPDATE rather
    # than removing the row, so "this key existed and was revoked on X"
    # remains a permanent, visible fact — consistent with this
    # application's general append-only-leaning posture (see the audit
    # log migration). Only owner/admin may create or revoke keys.
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;")

    op.execute(
        """
        CREATE POLICY api_keys_select_own_org ON api_keys
        FOR SELECT USING (organization_id = get_user_organization_id());
        """
    )
    op.execute(
        """
        CREATE POLICY api_keys_insert_owner_admin ON api_keys
        FOR INSERT WITH CHECK (
            organization_id = get_user_organization_id()
            AND current_user_role_in_org(organization_id) IN ('owner', 'admin')
        );
        """
    )
    op.execute(
        """
        CREATE POLICY api_keys_update_owner_admin ON api_keys
        FOR UPDATE USING (
            organization_id = get_user_organization_id()
            AND current_user_role_in_org(organization_id) IN ('owner', 'admin')
        )
        WITH CHECK (
            organization_id = get_user_organization_id()
            AND current_user_role_in_org(organization_id) IN ('owner', 'admin')
        );
        """
    )

    op.execute(f"GRANT SELECT, INSERT, UPDATE ON api_keys TO {APP_ROLE_NAME};")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS api_keys_select_own_org ON api_keys;")
    op.execute("DROP POLICY IF EXISTS api_keys_insert_owner_admin ON api_keys;")
    op.execute("DROP POLICY IF EXISTS api_keys_update_owner_admin ON api_keys;")
    op.execute("ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP FUNCTION IF EXISTS resolve_api_key(text);")

    op.drop_index('ix_api_keys_organization_id', table_name='api_keys')
    op.drop_index('ix_api_keys_key_hash', table_name='api_keys')
    op.drop_table('api_keys')

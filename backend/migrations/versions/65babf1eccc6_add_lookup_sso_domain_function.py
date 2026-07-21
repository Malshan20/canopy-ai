"""add lookup_sso_domain function

Revision ID: 65babf1eccc6
Revises: ee25a5939227
Create Date: 2026-07-10 07:55:36.766688

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '65babf1eccc6'
down_revision: Union[str, Sequence[str], None] = 'ee25a5939227'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SECURITY DEFINER, deliberately: the login form calls this before
    # any authentication exists at all, so it has no organization
    # context for RLS to scope against — this is the one narrow, safe
    # thing an anonymous caller legitimately needs to ask ("does this
    # email domain use SSO"), returned without exposing anything else
    # about the organization. Same pattern as resolve_api_key() and
    # claim_next_processing_job() — see those migrations for the fuller
    # explanation of why SECURITY DEFINER is the right tool here rather
    # than loosening the organizations table's RLS policy itself.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION lookup_sso_domain(p_domain text)
        RETURNS TABLE(sso_domain text)
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT organizations.sso_domain
            FROM organizations
            WHERE organizations.sso_domain = p_domain
              AND organizations.sso_enabled = true;
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER FUNCTION lookup_sso_domain(text) OWNER TO service_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped reassigning lookup_sso_domain ownership to service_role (non-fatal): %', SQLERRM;
        END
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION lookup_sso_domain(text) FROM PUBLIC;")
    op.execute("GRANT EXECUTE ON FUNCTION lookup_sso_domain(text) TO canopyai_app;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP FUNCTION IF EXISTS lookup_sso_domain(text);")

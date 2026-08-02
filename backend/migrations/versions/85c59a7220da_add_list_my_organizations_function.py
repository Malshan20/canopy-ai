"""add list_my_organizations function

Revision ID: 85c59a7220da
Revises: 65babf1eccc6
Create Date: 2026-07-10 12:37:51.783073

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '85c59a7220da'
down_revision: Union[str, Sequence[str], None] = '65babf1eccc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SECURITY DEFINER, deliberately: this needs to join user_roles with
    # organizations across every org a user belongs to, but a normal
    # RLS-scoped session can only see the ONE organization currently
    # selected in its JWT claims (organizations' own RLS policy is
    # "id = get_user_organization_id()" — exactly one org, by design).
    # This is the one legitimate place that needs to see "all of a
    # user's organizations at once", e.g. to populate a workspace
    # switcher — same pattern as resolve_api_key(),
    # claim_next_processing_job(), and lookup_sso_domain().
    #
    # SAFE because p_user_id is never client-supplied directly — every
    # caller (see app/api/v1/organizations.py's list_my_organizations
    # route) passes CurrentUser.user_id, which was already
    # cryptographically verified from the caller's own JWT. This
    # function does not, and must not, let a caller pass an arbitrary
    # user_id and see someone else's organizations.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION list_my_organizations(p_user_id uuid)
        RETURNS TABLE(organization_id uuid, name text, plan text, role text)
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT organizations.id, organizations.name, organizations.plan, user_roles.role
            FROM user_roles
            JOIN organizations ON organizations.id = user_roles.organization_id
            WHERE user_roles.user_id = p_user_id
            ORDER BY user_roles.created_at ASC;
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER FUNCTION list_my_organizations(uuid) OWNER TO service_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped reassigning list_my_organizations ownership to service_role (non-fatal): %', SQLERRM;
        END
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION list_my_organizations(uuid) FROM PUBLIC;")
    op.execute("GRANT EXECUTE ON FUNCTION list_my_organizations(uuid) TO canopyai_app;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP FUNCTION IF EXISTS list_my_organizations(uuid);")

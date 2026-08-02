"""add notification email helper functions

Revision ID: 327c7eef5733
Revises: 766979685e12
Create Date: 2026-07-10 16:25:34.022363

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '327c7eef5733'
down_revision: Union[str, Sequence[str], None] = '766979685e12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SECURITY DEFINER, deliberately: this is called from a background
    # notification-dispatch path (app/services/notification_service.py),
    # not from within an authenticated HTTP request — there's no real
    # user whose JWT claims could legitimately satisfy
    # get_user_organization_id()'s membership check (it verifies the
    # claimed org against a REAL user_roles row for the claiming user;
    # a background job has no "claiming user" at all). Bypassing RLS
    # here is safe because p_organization_id is never client-supplied —
    # it's always the same organization_id already established by
    # whatever real, already-authenticated action triggered the
    # notification in the first place (a shipment upload, a team change).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_notification_email_preference(p_organization_id uuid, p_notif_type text)
        RETURNS boolean
        LANGUAGE plpgsql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            result boolean;
        BEGIN
            CASE p_notif_type
                WHEN 'shipment_completed' THEN
                    SELECT email_on_shipment_completed INTO result FROM notification_preferences WHERE organization_id = p_organization_id;
                    RETURN COALESCE(result, true);  -- default ON if no preferences row exists yet
                WHEN 'team_member_added' THEN
                    SELECT email_on_team_member_added INTO result FROM notification_preferences WHERE organization_id = p_organization_id;
                    RETURN COALESCE(result, false);
                WHEN 'team_member_removed' THEN
                    SELECT email_on_team_member_removed INTO result FROM notification_preferences WHERE organization_id = p_organization_id;
                    RETURN COALESCE(result, false);
                WHEN 'plan_changed' THEN
                    SELECT email_on_plan_changed INTO result FROM notification_preferences WHERE organization_id = p_organization_id;
                    RETURN COALESCE(result, false);
                ELSE
                    RETURN false;
            END CASE;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_organization_member_emails(p_organization_id uuid)
        RETURNS TABLE(email text)
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT auth.users.email
            FROM user_roles
            JOIN auth.users ON auth.users.id = user_roles.user_id
            WHERE user_roles.organization_id = p_organization_id;
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER FUNCTION get_notification_email_preference(uuid, text) OWNER TO service_role;
            ALTER FUNCTION get_organization_member_emails(uuid) OWNER TO service_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped reassigning notification helper function ownership to service_role (non-fatal): %', SQLERRM;
        END
        $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION get_notification_email_preference(uuid, text) FROM PUBLIC;")
    op.execute("REVOKE ALL ON FUNCTION get_organization_member_emails(uuid) FROM PUBLIC;")
    op.execute("GRANT EXECUTE ON FUNCTION get_notification_email_preference(uuid, text) TO canopyai_app;")
    op.execute("GRANT EXECUTE ON FUNCTION get_organization_member_emails(uuid) TO canopyai_app;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP FUNCTION IF EXISTS get_notification_email_preference(uuid, text);")
    op.execute("DROP FUNCTION IF EXISTS get_organization_member_emails(uuid);")

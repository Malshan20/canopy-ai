"""add webhooks table

Revision ID: 2a4216abdf37
Revises: 4d2e09507c82
Create Date: 2026-07-09 01:01:23.244878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a4216abdf37'
down_revision: Union[str, Sequence[str], None] = '4d2e09507c82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('webhooks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('url', sa.String(length=2000), nullable=False),
    sa.Column('secret', sa.String(length=64), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_status_code', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['auth.users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment="Customer-configured HTTP endpoints notified when a shipment finishes processing. Payloads are HMAC-SHA256 signed with each webhook's own secret."
    )
    op.create_index('ix_webhooks_organization_id', 'webhooks', ['organization_id'], unique=False)

    # RLS — identical org-scoping + owner/admin-write pattern as api_keys
    # (see that migration's docstring for the full reasoning). Unlike
    # api_keys, DELETE is a real delete here (not a revoked_at flag) —
    # webhooks aren't a security-evidence record the way a credential is,
    # so there's no reason to keep a row around after removal.
    op.execute("ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;")

    op.execute(
        """
        CREATE POLICY webhooks_select_own_org ON webhooks
        FOR SELECT USING (organization_id = get_user_organization_id());
        """
    )
    op.execute(
        """
        CREATE POLICY webhooks_insert_owner_admin ON webhooks
        FOR INSERT WITH CHECK (
            organization_id = get_user_organization_id()
            AND current_user_role_in_org(organization_id) IN ('owner', 'admin')
        );
        """
    )
    op.execute(
        """
        CREATE POLICY webhooks_update_owner_admin ON webhooks
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
    op.execute(
        """
        CREATE POLICY webhooks_delete_owner_admin ON webhooks
        FOR DELETE USING (
            organization_id = get_user_organization_id()
            AND current_user_role_in_org(organization_id) IN ('owner', 'admin')
        );
        """
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON webhooks TO canopyai_app;")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS webhooks_select_own_org ON webhooks;")
    op.execute("DROP POLICY IF EXISTS webhooks_insert_owner_admin ON webhooks;")
    op.execute("DROP POLICY IF EXISTS webhooks_update_owner_admin ON webhooks;")
    op.execute("DROP POLICY IF EXISTS webhooks_delete_owner_admin ON webhooks;")
    op.execute("ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;")

    op.drop_index('ix_webhooks_organization_id', table_name='webhooks')
    op.drop_table('webhooks')

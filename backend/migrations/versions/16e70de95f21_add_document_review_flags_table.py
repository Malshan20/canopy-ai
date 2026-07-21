"""add document review flags table

Revision ID: 16e70de95f21
Revises: ef3b8ca731b6
Create Date: 2026-07-12 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16e70de95f21'
down_revision: Union[str, Sequence[str], None] = 'ef3b8ca731b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'document_flags',
        sa.Column('shipment_id', sa.UUID(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('is_flagged', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('flagged_by_user_id', sa.UUID(), nullable=False),
        sa.Column('flagged_by_email', sa.Text(), nullable=True),
        sa.Column('flagged_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('resolved_by_user_id', sa.UUID(), nullable=True),
        sa.Column('resolved_by_email', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['flagged_by_user_id'], ['auth.users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resolved_by_user_id'], ['auth.users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('shipment_id', 'document_id'),
        comment=(
            'One row per document that has ever been flagged for manual review. '
            'is_flagged is the current state (upserted on re-flag, cleared on '
            'resolve) rather than an append-only event log — the audit_log '
            'table already carries the full DOCUMENT_FLAGGED/DOCUMENT_FLAG_RESOLVED '
            'history for anyone who needs that.'
        ),
    )
    op.create_index('ix_document_flags_organization_id', 'document_flags', ['organization_id'], unique=False)
    op.create_index('ix_document_flags_shipment_id', 'document_flags', ['shipment_id'], unique=False)

    op.execute("ALTER TABLE document_flags ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE document_flags FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY document_flags_own_org ON document_flags
        FOR ALL USING (organization_id = get_user_organization_id())
        WITH CHECK (organization_id = get_user_organization_id());
        """
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON document_flags TO canopyai_app;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP POLICY IF EXISTS document_flags_own_org ON document_flags;")
    op.drop_index('ix_document_flags_shipment_id', table_name='document_flags')
    op.drop_index('ix_document_flags_organization_id', table_name='document_flags')
    op.drop_table('document_flags')

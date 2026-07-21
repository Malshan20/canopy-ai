"""add organization plan column

Revision ID: a60279514030
Revises: be151ebdcbe8
Create Date: 2026-07-08 17:34:38.278962

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a60279514030'
down_revision: Union[str, Sequence[str], None] = 'be151ebdcbe8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organizations', sa.Column('plan', sa.String(length=20), server_default='growth', nullable=False))
    op.create_check_constraint(
        'ck_organizations_valid_plan', 'organizations', "plan IN ('growth', 'enterprise', 'custom')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_organizations_valid_plan', 'organizations', type_='check')
    op.drop_column('organizations', 'plan')

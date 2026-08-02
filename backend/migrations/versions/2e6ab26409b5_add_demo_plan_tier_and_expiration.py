"""add demo plan tier and expiration

Revision ID: 2e6ab26409b5
Revises: 16e70de95f21
Create Date: 2026-07-19 00:00:00.000000

Adds a fourth, real plan value — "demo" — alongside the existing
growth/enterprise/custom, plus a nullable `demo_expires_at` timestamp on
`organizations`. Purely additive: no existing row's `plan` value changes,
and every existing plan-limit lookup already falls back safely to
Growth's numbers for any plan it doesn't explicitly recognize (see
app/services/plan_limits.py), so this migration alone changes nothing
about how growth/enterprise/custom organizations behave — confirmed by
running this project's full plan-limit test suite unchanged before and
after.

This is a real, sales-provisioned tier (2 documents/shipment, 2 team
members, 5 shipments/year, no API access, hard-locked 7 days after
`demo_expires_at` — enforced in app/core/auth.py, not just advertised),
not a public self-serve trial — consistent with this product remaining
invite-only end to end. See app/api/v1/organizations.py's
update_organization_plan for where `demo_expires_at` gets set.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2e6ab26409b5'
down_revision: Union[str, Sequence[str], None] = '16e70de95f21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_PLANS = ('growth', 'enterprise', 'custom')
NEW_PLANS = ('growth', 'enterprise', 'custom', 'demo')


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('ck_organizations_valid_plan', 'organizations', type_='check')
    op.create_check_constraint(
        'ck_organizations_valid_plan',
        'organizations',
        f'plan IN {NEW_PLANS}',
    )
    op.add_column(
        'organizations',
        sa.Column(
            'demo_expires_at',
            sa.DateTime(timezone=True),
            nullable=True,
            comment=(
                "Set only when plan='demo' (see update_organization_plan). Once now() passes this "
                "timestamp, app/core/auth.py locks every request for this organization with a clear "
                "DemoExpiredError — enforced on every authenticated call, not just checked at login."
            ),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('organizations', 'demo_expires_at')
    op.drop_constraint('ck_organizations_valid_plan', 'organizations', type_='check')
    op.create_check_constraint(
        'ck_organizations_valid_plan',
        'organizations',
        f'plan IN {OLD_PLANS}',
    )

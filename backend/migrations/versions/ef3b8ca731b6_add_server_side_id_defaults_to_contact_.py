"""add server-side id defaults to contact ticket tables

Revision ID: ef3b8ca731b6
Revises: 48f542bac65b
Create Date: 2026-07-11 06:59:52.464118

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef3b8ca731b6'
down_revision: Union[str, Sequence[str], None] = '48f542bac65b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # A real bug, caught by actually testing the exact insert shape the
    # separate admin panel project uses (Supabase-JS's `.insert({...})`
    # with no `id` field set at all, relying entirely on the database to
    # generate one) — these tables only had a Python-side ORM default
    # (`default=uuid.uuid4`), which only helps callers going through
    # SQLAlchemy. The main backend's own routes happen to set `id`
    # explicitly in their raw SQL, which is why this was never hit
    # there; the admin panel's simpler insert calls would have failed
    # with a NOT NULL violation the first time someone used it for real.
    op.execute("ALTER TABLE contact_tickets ALTER COLUMN id SET DEFAULT gen_random_uuid();")
    op.execute("ALTER TABLE contact_ticket_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE contact_tickets ALTER COLUMN id DROP DEFAULT;")
    op.execute("ALTER TABLE contact_ticket_messages ALTER COLUMN id DROP DEFAULT;")

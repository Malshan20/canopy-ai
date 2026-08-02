"""create audit_log table

Revision ID: 6eeaf452502c
Revises:
Create Date: 2026-07-07 11:16:37.863723

--------------------------------------------------------------------------
APPEND-ONLY ENFORCEMENT — READ BEFORE MODIFYING THIS MIGRATION
--------------------------------------------------------------------------
`audit_log` is CanoryAI's permanent EUDR compliance evidence ledger. This
migration enforces "insert-only, forever" at TWO independent layers so a
single bug or compromised credential can't quietly rewrite history:

  1. TRIGGER (defense in depth, applies to every role including superusers
     that don't explicitly bypass triggers): `prevent_audit_log_modification()`
     raises on any UPDATE or DELETE against the table, unconditionally.

  2. ROLE PERMISSIONS (the primary control for the app's normal runtime
     role): `REVOKE UPDATE, DELETE, TRUNCATE ... FROM canopyai_app` means
     the credentials the FastAPI app actually connects with are physically
     incapable of issuing those statements, regardless of what the
     application code does or doesn't check.

Production deployment guidance:
  * The application's runtime database role (here assumed to be named
    `canopyai_app` — adjust the constant below if yours differs) should
    hold only INSERT and SELECT on `audit_log`. It should never be granted
    UPDATE, DELETE, or TRUNCATE, and should not own the table.
  * Only a separate, tightly-held migration/admin role (used exclusively
    for running `alembic upgrade`, never by the running application)
    should be able to alter this table's schema or drop the protective
    trigger.
  * `canopyai_app` must already exist before this migration runs (create
    it once via `CREATE ROLE canopyai_app WITH LOGIN PASSWORD '...';`) —
    the REVOKE below will fail with an "role does not exist" error
    otherwise, which is intentional: it forces the role to be provisioned
    deliberately rather than silently skipped.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6eeaf452502c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Adjust to match your deployment's actual application database role name.
APP_ROLE_NAME = "canopyai_app"


def upgrade() -> None:
    op.create_table(
        'audit_log',
        sa.Column('id', sa.UUID(), nullable=False, comment='Unique audit event identifier.'),
        sa.Column(
            'shipment_id',
            sa.UUID(),
            nullable=False,
            comment=(
                'Links this event to a shipment. Not a foreign key: shipments are '
                'not yet a persisted table (see app/services/shipment_store.py) — '
                'this column is indexed for query performance and will become a '
                'real foreign key once a shipments table exists.'
            ),
        ),
        sa.Column(
            'timestamp',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
            comment='UTC timestamp of when this event was recorded, set by the database.',
        ),
        sa.Column(
            'actor',
            sa.String(length=255),
            nullable=False,
            comment='Who/what caused this event, e.g. "CanoryAI", "System", or a user identifier.',
        ),
        sa.Column(
            'action_type',
            sa.String(length=100),
            nullable=False,
            comment=(
                'Event category, e.g. DOCUMENT_EXTRACTED, SATELLITE_CHECK_COMPLETED, '
                'SATELLITE_CHECK_FAILED, MASS_BALANCE_PASSED, MASS_BALANCE_FAILED, '
                'MANUAL_OVERRIDE, XML_GENERATED. See app/schemas/audit.py for the '
                'canonical set.'
            ),
        ),
        sa.Column(
            'details',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default='{}',
            nullable=False,
            comment='Complete event metadata as JSON — confidence scores, coordinates, field diffs, etc.',
        ),
        sa.PrimaryKeyConstraint('id'),
        comment=(
            'APPEND-ONLY legal evidence ledger for EUDR compliance actions. '
            'INSERT only — never UPDATE or DELETE. Enforced by a database '
            'trigger and role permissions; see this migration file.'
        ),
    )
    op.create_index(
        'ix_audit_log_shipment_id_timestamp', 'audit_log', ['shipment_id', 'timestamp'], unique=False
    )

    # --- Layer 1: trigger-based immutability, independent of role/grants ---
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION
                'audit_log is an append-only table: % operations are not permitted (row id=%)',
                TG_OP, OLD.id
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_log_prevent_update
            BEFORE UPDATE ON audit_log
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_log_prevent_delete
            BEFORE DELETE ON audit_log
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
        """
    )

    # --- Layer 2: role-permission-based immutability for the app's runtime role ---
    op.execute(f"GRANT SELECT, INSERT ON audit_log TO {APP_ROLE_NAME};")
    op.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM {APP_ROLE_NAME};")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_prevent_delete ON audit_log;")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_prevent_update ON audit_log;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_modification();")
    op.drop_index('ix_audit_log_shipment_id_timestamp', table_name='audit_log')
    op.drop_table('audit_log')

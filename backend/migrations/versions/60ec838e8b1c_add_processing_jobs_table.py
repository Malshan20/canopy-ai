"""add processing_jobs table

Revision ID: 60ec838e8b1c
Revises: 2a4216abdf37
Create Date: 2026-07-09 01:15:32.686368

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '60ec838e8b1c'
down_revision: Union[str, Sequence[str], None] = '2a4216abdf37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE_NAME = "canopyai_app"


def upgrade() -> None:
    op.create_table('processing_jobs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('priority', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('zip_path', sa.Text(), nullable=False),
    sa.Column('source_filename', sa.String(length=500), nullable=False),
    sa.Column('declared_weight_kg', sa.Float(), nullable=False),
    sa.Column('shipment_id', sa.UUID(), nullable=True),
    sa.Column('error_detail', sa.Text(), nullable=True),
    sa.Column('result_payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name='ck_processing_jobs_valid_status'),
    sa.ForeignKeyConstraint(['created_by'], ['auth.users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment="Async shipment-processing job queue. Claimed via SELECT ... FOR UPDATE SKIP LOCKED — see this model's module docstring."
    )
    op.create_index('ix_processing_jobs_claim_order', 'processing_jobs', ['status', 'priority', 'created_at'], unique=False)
    op.create_index('ix_processing_jobs_organization_id', 'processing_jobs', ['organization_id'], unique=False)

    # ------------------------------------------------------------------
    # RLS — customer-facing access (enqueue a job, check its status) is
    # org-scoped exactly like everywhere else. The WORKER's job is
    # fundamentally cross-tenant (claim whichever organization's job is
    # next), which normal RLS scoping structurally cannot express — so
    # claiming and completing jobs goes through three SECURITY DEFINER
    # functions below instead, same ownership pattern (and same reasoning
    # about *why* — see the multi-tenancy and api_keys migrations) as
    # every other cross-tenant operation in this schema.
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE processing_jobs FORCE ROW LEVEL SECURITY;")

    op.execute(
        """
        CREATE POLICY processing_jobs_select_own_org ON processing_jobs
        FOR SELECT USING (organization_id = get_user_organization_id());
        """
    )
    op.execute(
        """
        CREATE POLICY processing_jobs_insert_own_org ON processing_jobs
        FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
        """
    )

    op.execute(f"GRANT SELECT, INSERT ON processing_jobs TO {APP_ROLE_NAME};")

    # claim_next_processing_job(): atomically claims and marks the single
    # highest-priority, oldest queued job as "processing", across every
    # organization. SKIP LOCKED means two concurrent callers can never
    # claim the same row — safe even if WEB_CONCURRENCY were ever raised
    # above 1 (see this table's module docstring for the full caveat).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION claim_next_processing_job()
        RETURNS TABLE(
            id uuid, organization_id uuid, created_by uuid, zip_path text,
            source_filename varchar(500), declared_weight_kg float
        )
        LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            claimed_id uuid;
        BEGIN
            SELECT pj.id INTO claimed_id
            FROM processing_jobs pj
            WHERE pj.status = 'queued'
            ORDER BY pj.priority DESC, pj.created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1;

            IF claimed_id IS NULL THEN
                RETURN;
            END IF;

            RETURN QUERY
            UPDATE processing_jobs
            SET status = 'processing', started_at = now()
            WHERE processing_jobs.id = claimed_id
            RETURNING processing_jobs.id, processing_jobs.organization_id, processing_jobs.created_by,
                      processing_jobs.zip_path, processing_jobs.source_filename, processing_jobs.declared_weight_kg;
        END;
        $$;
        """
    )

    # complete_processing_job() / fail_processing_job(): the worker's only
    # way to write a result back, regardless of which organization the
    # job belongs to — it has no "current org" context of its own.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION complete_processing_job(
            p_job_id uuid, p_shipment_id uuid, p_result_payload jsonb
        ) RETURNS void
        LANGUAGE sql SECURITY DEFINER
        SET search_path = public
        AS $$
            UPDATE processing_jobs
            SET status = 'completed', shipment_id = p_shipment_id,
                result_payload = p_result_payload, completed_at = now()
            WHERE id = p_job_id;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fail_processing_job(p_job_id uuid, p_error_detail text)
        RETURNS void
        LANGUAGE sql SECURITY DEFINER
        SET search_path = public
        AS $$
            UPDATE processing_jobs
            SET status = 'failed', error_detail = p_error_detail, completed_at = now()
            WHERE id = p_job_id;
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            ALTER FUNCTION claim_next_processing_job() OWNER TO service_role;
            ALTER FUNCTION complete_processing_job(uuid, uuid, jsonb) OWNER TO service_role;
            ALTER FUNCTION fail_processing_job(uuid, text) OWNER TO service_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped reassigning processing-job function ownership to service_role (non-fatal): %', SQLERRM;
        END
        $$;
        """
    )
    op.execute("GRANT SELECT ON processing_jobs TO service_role;")
    op.execute("GRANT UPDATE ON processing_jobs TO service_role;")
    op.execute(f"GRANT EXECUTE ON FUNCTION claim_next_processing_job() TO {APP_ROLE_NAME};")
    op.execute(f"GRANT EXECUTE ON FUNCTION complete_processing_job(uuid, uuid, jsonb) TO {APP_ROLE_NAME};")
    op.execute(f"GRANT EXECUTE ON FUNCTION fail_processing_job(uuid, text) TO {APP_ROLE_NAME};")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS claim_next_processing_job();")
    op.execute("DROP FUNCTION IF EXISTS complete_processing_job(uuid, uuid, jsonb);")
    op.execute("DROP FUNCTION IF EXISTS fail_processing_job(uuid, text);")
    op.execute("DROP POLICY IF EXISTS processing_jobs_select_own_org ON processing_jobs;")
    op.execute("DROP POLICY IF EXISTS processing_jobs_insert_own_org ON processing_jobs;")
    op.execute("ALTER TABLE processing_jobs DISABLE ROW LEVEL SECURITY;")

    op.drop_index('ix_processing_jobs_organization_id', table_name='processing_jobs')
    op.drop_index('ix_processing_jobs_claim_order', table_name='processing_jobs')
    op.drop_table('processing_jobs')

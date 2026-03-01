ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE job_applications
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS assigned_provider_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS accepted_application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_provider_created_at_desc
  ON job_applications (provider_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_job_status_created_at_desc
  ON job_applications (job_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_status_updated_at_desc
  ON jobs (status, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_assigned_provider_distinct_chk'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_assigned_provider_distinct_chk
      CHECK (
        assigned_provider_user_id IS NULL
        OR assigned_provider_user_id <> seeker_user_id
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_booking_state_consistency_chk'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_booking_state_consistency_chk
      CHECK (
        (
          status IN (
            'accepted'::job_status,
            'in_progress'::job_status,
            'completed'::job_status
          )
          AND assigned_provider_user_id IS NOT NULL
          AND accepted_application_id IS NOT NULL
        )
        OR
        (
          status = 'posted'::job_status
          AND assigned_provider_user_id IS NULL
          AND accepted_application_id IS NULL
        )
        OR
        status = 'cancelled'::job_status
      );
  END IF;
END
$$;

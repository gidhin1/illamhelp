DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'job_visibility'
  ) THEN
    CREATE TYPE job_visibility AS ENUM ('public', 'connections_only');
  END IF;
END
$$;

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS visibility job_visibility;

UPDATE jobs
SET visibility = 'public'::job_visibility
WHERE visibility IS NULL;

ALTER TABLE jobs
ALTER COLUMN visibility SET DEFAULT 'public'::job_visibility;

ALTER TABLE jobs
ALTER COLUMN visibility SET NOT NULL;

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'payment_done';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'payment_received';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'closed';

ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS jobs_booking_state_consistency_chk;

ALTER TABLE jobs
ADD CONSTRAINT jobs_booking_state_consistency_chk
CHECK (
  (
    status IN (
      'accepted'::job_status,
      'in_progress'::job_status,
      'completed'::job_status,
      'payment_done'::job_status,
      'payment_received'::job_status,
      'closed'::job_status
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

CREATE INDEX IF NOT EXISTS idx_jobs_visibility_status_created_at_desc
  ON jobs (visibility, status, created_at DESC);

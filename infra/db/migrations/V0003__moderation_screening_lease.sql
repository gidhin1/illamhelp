ALTER TABLE moderation_jobs
  ADD COLUMN screening_lease_token uuid,
  ADD COLUMN screening_lease_until timestamptz,
  ADD COLUMN screening_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN screening_available_at timestamptz NOT NULL DEFAULT now();

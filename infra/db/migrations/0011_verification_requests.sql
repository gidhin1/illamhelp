-- Provider verification request workflow
-- Tracks verification submissions from providers and admin review decisions

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM (
    'pending',
    'under_review',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  document_media_ids UUID[] NOT NULL DEFAULT '{}',
  document_type TEXT NOT NULL,
  notes TEXT,
  status verification_status NOT NULL DEFAULT 'pending',
  reviewer_user_id UUID REFERENCES users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_user_id ON verification_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests (status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_created_at ON verification_requests (created_at DESC);

-- Prevent multiple pending/under_review requests from the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_active_per_user
  ON verification_requests (user_id)
  WHERE status IN ('pending', 'under_review');

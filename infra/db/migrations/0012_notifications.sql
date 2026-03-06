-- In-app notification system
-- Stores user notifications with read tracking for job updates, connection events, verification status, etc.

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'job_application_received',
    'job_application_accepted',
    'job_application_rejected',
    'job_booking_started',
    'job_booking_completed',
    'job_booking_cancelled',
    'connection_request_received',
    'connection_request_accepted',
    'connection_request_declined',
    'verification_approved',
    'verification_rejected',
    'consent_grant_received',
    'consent_grant_revoked',
    'media_approved',
    'media_rejected',
    'system_announcement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE read = false;

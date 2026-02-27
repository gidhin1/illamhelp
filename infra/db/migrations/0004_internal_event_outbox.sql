CREATE TABLE IF NOT EXISTS internal_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload_protobuf BYTEA NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_internal_event_outbox_status_created_at
  ON internal_event_outbox (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_internal_event_outbox_event_name_created_at
  ON internal_event_outbox (event_name, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_event_outbox_status_chk'
  ) THEN
    ALTER TABLE internal_event_outbox
      ADD CONSTRAINT internal_event_outbox_status_chk
      CHECK (status IN ('pending', 'published', 'failed'));
  END IF;
END
$$;

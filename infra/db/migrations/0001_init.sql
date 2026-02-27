CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('both', 'seeker', 'provider', 'admin', 'support');
CREATE TYPE job_status AS ENUM ('posted', 'accepted', 'in_progress', 'completed', 'cancelled');
CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');
CREATE TYPE pii_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE pii_grant_status AS ENUM ('active', 'revoked');
CREATE TYPE media_kind AS ENUM ('image', 'video');
CREATE TYPE media_state AS ENUM (
  'uploaded',
  'scanning',
  'ai_reviewed',
  'human_review_pending',
  'approved',
  'rejected',
  'appeal_pending',
  'appeal_resolved'
);
CREATE TYPE moderation_stage AS ENUM ('technical_validation', 'ai_review', 'human_review');
CREATE TYPE moderation_status AS ENUM ('pending', 'running', 'approved', 'rejected', 'error');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  email_masked TEXT,
  phone_masked TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  city TEXT,
  area TEXT,
  service_categories TEXT[] NOT NULL DEFAULT '{}',
  rating_average NUMERIC(3, 2),
  rating_count INTEGER NOT NULL DEFAULT 0,
  pii_email_encrypted BYTEA,
  pii_phone_encrypted BYTEA,
  pii_alternate_phone_encrypted BYTEA,
  pii_full_address_encrypted BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_text TEXT NOT NULL,
  budget_min NUMERIC(10, 2),
  budget_max NUMERIC(10, 2),
  status job_status NOT NULL DEFAULT 'posted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, provider_user_id)
);

CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status connection_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT connections_distinct_users CHECK (user_a_id <> user_b_id),
  UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE pii_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  requested_fields TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  status pii_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT pii_access_requests_distinct_users CHECK (requester_user_id <> owner_user_id)
);

CREATE TABLE pii_consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  granted_fields TEXT[] NOT NULL,
  status pii_grant_status NOT NULL DEFAULT 'active',
  purpose TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  CONSTRAINT pii_consent_grants_distinct_users CHECK (owner_user_id <> grantee_user_id)
);

CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  kind media_kind NOT NULL,
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  state media_state NOT NULL DEFAULT 'uploaded',
  ai_scores JSONB,
  moderation_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moderation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  stage moderation_stage NOT NULL,
  status moderation_status NOT NULL DEFAULT 'pending',
  assigned_moderator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason_code TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  purpose TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_seeker_user_id ON jobs (seeker_user_id);
CREATE INDEX idx_job_applications_job_id ON job_applications (job_id);
CREATE INDEX idx_connections_users ON connections (user_a_id, user_b_id);
CREATE INDEX idx_pii_access_requests_owner ON pii_access_requests (owner_user_id, status);
CREATE INDEX idx_pii_consent_grants_owner_grantee ON pii_consent_grants (owner_user_id, grantee_user_id, status);
CREATE INDEX idx_media_assets_owner_state ON media_assets (owner_user_id, state);
CREATE INDEX idx_moderation_jobs_media_stage ON moderation_jobs (media_asset_id, stage, status);
CREATE INDEX idx_audit_events_actor_created_at ON audit_events (actor_user_id, created_at DESC);

-- Baseline schema while IllamHelp has no persistent production data.
-- Once this baseline is deployed to a data-bearing environment, do not edit it.
-- Add new Flyway versioned migrations for subsequent schema changes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('both', 'seeker', 'provider', 'admin', 'support');
CREATE TYPE job_status AS ENUM (
  'posted',
  'accepted',
  'in_progress',
  'completed',
  'payment_done',
  'payment_received',
  'closed',
  'cancelled'
);
CREATE TYPE job_visibility AS ENUM ('public', 'connections_only');
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
CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
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

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  username TEXT NOT NULL,
  email_masked TEXT,
  phone_masked TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
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
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  budget_min NUMERIC(10, 2),
  budget_max NUMERIC(10, 2),
  status job_status NOT NULL DEFAULT 'posted',
  visibility job_visibility NOT NULL DEFAULT 'public',
  assigned_provider_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_application_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jobs_location_latitude_range
    CHECK (location_latitude IS NULL OR location_latitude BETWEEN -90 AND 90),
  CONSTRAINT jobs_location_longitude_range
    CHECK (location_longitude IS NULL OR location_longitude BETWEEN -180 AND 180),
  CONSTRAINT jobs_assigned_provider_distinct_chk
    CHECK (assigned_provider_user_id IS NULL OR assigned_provider_user_id <> seeker_user_id)
);

CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, provider_user_id)
);

ALTER TABLE jobs
  ADD CONSTRAINT jobs_accepted_application_id_fk
  FOREIGN KEY (accepted_application_id) REFERENCES job_applications(id) ON DELETE SET NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_booking_state_consistency_chk
  CHECK (
    (
      status IN ('accepted', 'in_progress', 'completed', 'payment_done', 'payment_received', 'closed')
      AND assigned_provider_user_id IS NOT NULL
      AND accepted_application_id IS NOT NULL
    )
    OR
    (
      status = 'posted'
      AND assigned_provider_user_id IS NULL
      AND accepted_application_id IS NULL
    )
    OR status = 'cancelled'
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
  CONSTRAINT connections_requested_by_participant_chk
    CHECK (requested_by_user_id = user_a_id OR requested_by_user_id = user_b_id),
  CONSTRAINT connections_decided_at_consistency_chk
    CHECK (
      (status = 'pending' AND decided_at IS NULL)
      OR (status <> 'pending' AND decided_at IS NOT NULL)
    ),
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
  CONSTRAINT pii_access_requests_distinct_users CHECK (requester_user_id <> owner_user_id),
  CONSTRAINT pii_access_requests_non_empty_fields_chk CHECK (cardinality(requested_fields) > 0),
  CONSTRAINT pii_access_requests_resolved_at_consistency_chk
    CHECK (
      (status = 'pending' AND resolved_at IS NULL)
      OR (status <> 'pending' AND resolved_at IS NOT NULL)
    )
);

CREATE TABLE pii_consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_request_id UUID REFERENCES pii_access_requests(id) ON DELETE SET NULL,
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
  CONSTRAINT pii_consent_grants_distinct_users CHECK (owner_user_id <> grantee_user_id),
  CONSTRAINT pii_consent_grants_non_empty_fields_chk CHECK (cardinality(granted_fields) > 0),
  CONSTRAINT pii_consent_grants_expiry_after_granted_chk
    CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT pii_consent_grants_revoked_after_granted_chk
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CONSTRAINT pii_consent_grants_revocation_consistency_chk
    CHECK (
      (status = 'active' AND revoked_at IS NULL AND revoke_reason IS NULL)
      OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
    )
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

CREATE TABLE internal_event_outbox (
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
  published_at TIMESTAMPTZ,
  CONSTRAINT internal_event_outbox_status_chk CHECK (status IN ('pending', 'published', 'failed'))
);

CREATE TABLE verification_requests (
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

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE connection_search_documents (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  location_label TEXT,
  service_categories TEXT[] NOT NULL DEFAULT '{}',
  recent_job_categories TEXT[] NOT NULL DEFAULT '{}',
  recent_locations TEXT[] NOT NULL DEFAULT '{}',
  job_count BIGINT NOT NULL DEFAULT 0,
  searchable_text TEXT NOT NULL DEFAULT '',
  search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION refresh_connection_search_document(target_user_id UUID) RETURNS VOID AS $$
BEGIN
  INSERT INTO connection_search_documents (
    user_id, display_name, location_label, service_categories, recent_job_categories,
    recent_locations, job_count, searchable_text, search_vector, updated_at
  )
  SELECT u.id,
         coalesce(nullif(trim(concat(p.first_name, ' ', coalesce(p.last_name, ''))), ''), u.username),
         nullif(trim(concat(coalesce(p.area, ''), ' ', coalesce(p.city, ''))), ''),
         coalesce(p.service_categories, '{}'::text[]),
         coalesce(j.job_categories, '{}'::text[]),
         coalesce(j.job_locations, '{}'::text[]),
         coalesce(j.job_count, 0),
         lower(concat_ws(' ', u.username, p.first_name, p.last_name, p.city, p.area,
           array_to_string(coalesce(p.service_categories, '{}'::text[]), ' '),
           array_to_string(coalesce(j.job_categories, '{}'::text[]), ' '),
           array_to_string(coalesce(j.job_locations, '{}'::text[]), ' '))),
         to_tsvector('simple', lower(concat_ws(' ', u.username, p.first_name, p.last_name, p.city, p.area,
           array_to_string(coalesce(p.service_categories, '{}'::text[]), ' '),
           array_to_string(coalesce(j.job_categories, '{}'::text[]), ' '),
           array_to_string(coalesce(j.job_locations, '{}'::text[]), ' ')))),
         now()
  FROM users u LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT array_remove(array_agg(DISTINCT category), NULL) AS job_categories,
           array_remove(array_agg(DISTINCT location_text), NULL) AS job_locations,
           count(*) AS job_count
    FROM jobs WHERE seeker_user_id = u.id
  ) j ON TRUE
  WHERE u.id = target_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    location_label = EXCLUDED.location_label,
    service_categories = EXCLUDED.service_categories,
    recent_job_categories = EXCLUDED.recent_job_categories,
    recent_locations = EXCLUDED.recent_locations,
    job_count = EXCLUDED.job_count,
    searchable_text = EXCLUDED.searchable_text,
    search_vector = EXCLUDED.search_vector,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_connection_search_for_user_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_connection_search_document(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_connection_search_for_profile_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_connection_search_document(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_connection_search_for_job_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.seeker_user_id <> NEW.seeker_user_id THEN
    PERFORM refresh_connection_search_document(OLD.seeker_user_id);
  END IF;
  PERFORM refresh_connection_search_document(COALESCE(NEW.seeker_user_id, OLD.seeker_user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_connection_search_users
  AFTER INSERT OR UPDATE OF username ON users
  FOR EACH ROW EXECUTE FUNCTION refresh_connection_search_for_user_change();
CREATE TRIGGER trg_connection_search_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION refresh_connection_search_for_profile_change();
CREATE TRIGGER trg_connection_search_jobs
  AFTER INSERT OR UPDATE OR DELETE ON jobs
  FOR EACH ROW EXECUTE FUNCTION refresh_connection_search_for_job_change();

CREATE UNIQUE INDEX users_username_unique_idx ON users (LOWER(username));
CREATE INDEX idx_users_verified ON users (verified) WHERE verified = TRUE;
CREATE INDEX idx_jobs_seeker_user_id ON jobs (seeker_user_id);
CREATE INDEX idx_jobs_assigned_provider_created_at_desc ON jobs (assigned_provider_user_id, created_at DESC, id DESC)
  WHERE assigned_provider_user_id IS NOT NULL;
CREATE INDEX idx_jobs_status_updated_at_desc ON jobs (status, updated_at DESC);
CREATE INDEX idx_jobs_visibility_status_created_at_desc ON jobs (visibility, status, created_at DESC, id DESC);
CREATE INDEX idx_jobs_location_lat_lon ON jobs (location_latitude, location_longitude)
  WHERE location_latitude IS NOT NULL AND location_longitude IS NOT NULL;
CREATE INDEX idx_jobs_title_trgm ON jobs USING GIN (lower(title) gin_trgm_ops);
CREATE INDEX idx_jobs_description_trgm ON jobs USING GIN (lower(description) gin_trgm_ops);
CREATE INDEX idx_jobs_category_trgm ON jobs USING GIN (lower(category) gin_trgm_ops);
CREATE INDEX idx_jobs_location_text_trgm ON jobs USING GIN (lower(location_text) gin_trgm_ops);
CREATE INDEX idx_job_applications_job_id ON job_applications (job_id);
CREATE INDEX idx_job_applications_provider_created_at_desc ON job_applications (provider_user_id, created_at DESC);
CREATE INDEX idx_job_applications_job_status_created_at_desc ON job_applications (job_id, status, created_at DESC);
CREATE INDEX idx_connections_users ON connections (user_a_id, user_b_id);
CREATE INDEX idx_connections_user_a_requested_at_desc ON connections (user_a_id, requested_at DESC, id DESC);
CREATE INDEX idx_connections_user_b_requested_at_desc ON connections (user_b_id, requested_at DESC, id DESC);
CREATE INDEX idx_pii_access_requests_owner ON pii_access_requests (owner_user_id, status);
CREATE INDEX idx_pii_access_requests_requester_created_at_desc ON pii_access_requests (requester_user_id, created_at DESC);
CREATE INDEX idx_pii_access_requests_owner_created_at_desc ON pii_access_requests (owner_user_id, created_at DESC);
CREATE INDEX idx_pii_access_requests_requested_fields_gin ON pii_access_requests USING GIN (requested_fields);
CREATE INDEX idx_pii_consent_grants_owner_grantee ON pii_consent_grants (owner_user_id, grantee_user_id, status);
CREATE INDEX idx_pii_consent_grants_access_request_id ON pii_consent_grants (access_request_id);
CREATE INDEX idx_pii_consent_grants_owner_granted_at_desc ON pii_consent_grants (owner_user_id, granted_at DESC);
CREATE INDEX idx_pii_consent_grants_grantee_granted_at_desc ON pii_consent_grants (grantee_user_id, granted_at DESC);
CREATE INDEX idx_pii_consent_grants_active_owner_grantee_granted_at_desc
  ON pii_consent_grants (owner_user_id, grantee_user_id, granted_at DESC)
  WHERE status = 'active';
CREATE UNIQUE INDEX idx_pii_consent_grants_one_active_per_connection
  ON pii_consent_grants (owner_user_id, grantee_user_id, connection_id)
  WHERE status = 'active';
CREATE INDEX idx_pii_consent_grants_granted_fields_gin ON pii_consent_grants USING GIN (granted_fields);
CREATE INDEX idx_media_assets_owner_state ON media_assets (owner_user_id, state);
CREATE INDEX idx_media_assets_owner_created_at_desc ON media_assets (owner_user_id, created_at DESC, id DESC);
CREATE INDEX idx_media_assets_approved_owner_created_at_desc
  ON media_assets (owner_user_id, created_at DESC, id DESC) WHERE state = 'approved';
CREATE INDEX idx_moderation_jobs_media_stage ON moderation_jobs (media_asset_id, stage, status);
CREATE INDEX idx_moderation_jobs_pending_queue
  ON moderation_jobs (stage, created_at ASC, id) WHERE status = 'pending';
CREATE INDEX idx_audit_events_actor_created_at ON audit_events (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_events_target_created_at ON audit_events (target_user_id, created_at DESC);
CREATE INDEX idx_audit_events_event_type_created_at ON audit_events (event_type, created_at DESC);
CREATE INDEX idx_internal_event_outbox_status_created_at ON internal_event_outbox (status, created_at ASC);
CREATE INDEX idx_internal_event_outbox_event_name_created_at ON internal_event_outbox (event_name, created_at DESC);
CREATE INDEX idx_verification_requests_user_id ON verification_requests (user_id);
CREATE INDEX idx_verification_requests_status ON verification_requests (status);
CREATE INDEX idx_verification_requests_created_at ON verification_requests (created_at DESC);
CREATE INDEX idx_verification_requests_status_created_at_desc
  ON verification_requests (status, created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_verification_requests_one_active_per_user
  ON verification_requests (user_id) WHERE status IN ('pending', 'under_review');
CREATE INDEX idx_notifications_user_id_created ON notifications (user_id, created_at DESC, id DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read = FALSE;
CREATE INDEX idx_notifications_user_unread_created_at_desc
  ON notifications (user_id, created_at DESC, id DESC) WHERE read = FALSE;
CREATE INDEX idx_connection_search_documents_vector
  ON connection_search_documents USING GIN (search_vector);
CREATE INDEX idx_connection_search_documents_text_trgm
  ON connection_search_documents USING GIN (searchable_text gin_trgm_ops);
CREATE INDEX idx_connection_search_documents_job_count
  ON connection_search_documents (job_count DESC, updated_at DESC);

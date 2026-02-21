-- Scale-focused indexes for hot read paths
CREATE INDEX IF NOT EXISTS idx_connections_user_a_requested_at_desc
  ON connections (user_a_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_connections_user_b_requested_at_desc
  ON connections (user_b_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_access_requests_requester_created_at_desc
  ON pii_access_requests (requester_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_access_requests_owner_created_at_desc
  ON pii_access_requests (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_access_requests_requested_fields_gin
  ON pii_access_requests
  USING GIN (requested_fields);

CREATE INDEX IF NOT EXISTS idx_pii_consent_grants_owner_granted_at_desc
  ON pii_consent_grants (owner_user_id, granted_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_consent_grants_grantee_granted_at_desc
  ON pii_consent_grants (grantee_user_id, granted_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_consent_grants_active_owner_grantee_granted_at_desc
  ON pii_consent_grants (owner_user_id, grantee_user_id, granted_at DESC)
  WHERE status = 'active'::pii_grant_status;

CREATE INDEX IF NOT EXISTS idx_pii_consent_grants_granted_fields_gin
  ON pii_consent_grants
  USING GIN (granted_fields);

CREATE INDEX IF NOT EXISTS idx_audit_events_target_created_at
  ON audit_events (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type_created_at
  ON audit_events (event_type, created_at DESC);

-- Data consistency constraints for lifecycle state transitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'connections_requested_by_participant_chk'
  ) THEN
    ALTER TABLE connections
      ADD CONSTRAINT connections_requested_by_participant_chk
      CHECK (requested_by_user_id = user_a_id OR requested_by_user_id = user_b_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'connections_decided_at_consistency_chk'
  ) THEN
    ALTER TABLE connections
      ADD CONSTRAINT connections_decided_at_consistency_chk
      CHECK (
        (status = 'pending'::connection_status AND decided_at IS NULL)
        OR
        (status <> 'pending'::connection_status AND decided_at IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_access_requests_resolved_at_consistency_chk'
  ) THEN
    ALTER TABLE pii_access_requests
      ADD CONSTRAINT pii_access_requests_resolved_at_consistency_chk
      CHECK (
        (status = 'pending'::pii_request_status AND resolved_at IS NULL)
        OR
        (status <> 'pending'::pii_request_status AND resolved_at IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_access_requests_non_empty_fields_chk'
  ) THEN
    ALTER TABLE pii_access_requests
      ADD CONSTRAINT pii_access_requests_non_empty_fields_chk
      CHECK (cardinality(requested_fields) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_consent_grants_revocation_consistency_chk'
  ) THEN
    ALTER TABLE pii_consent_grants
      ADD CONSTRAINT pii_consent_grants_revocation_consistency_chk
      CHECK (
        (
          status = 'active'::pii_grant_status
          AND revoked_at IS NULL
          AND revoke_reason IS NULL
        )
        OR
        (
          status = 'revoked'::pii_grant_status
          AND revoked_at IS NOT NULL
          AND revoke_reason IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_consent_grants_non_empty_fields_chk'
  ) THEN
    ALTER TABLE pii_consent_grants
      ADD CONSTRAINT pii_consent_grants_non_empty_fields_chk
      CHECK (cardinality(granted_fields) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_consent_grants_expiry_after_granted_chk'
  ) THEN
    ALTER TABLE pii_consent_grants
      ADD CONSTRAINT pii_consent_grants_expiry_after_granted_chk
      CHECK (expires_at IS NULL OR expires_at > granted_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pii_consent_grants_revoked_after_granted_chk'
  ) THEN
    ALTER TABLE pii_consent_grants
      ADD CONSTRAINT pii_consent_grants_revoked_after_granted_chk
      CHECK (revoked_at IS NULL OR revoked_at >= granted_at);
  END IF;
END $$;

ALTER TABLE pii_consent_grants
ADD COLUMN IF NOT EXISTS access_request_id UUID REFERENCES pii_access_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pii_consent_grants_access_request_id
ON pii_consent_grants (access_request_id);

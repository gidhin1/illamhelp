-- Add verified flag for provider verification
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for admin queries filtering by verified status
CREATE INDEX IF NOT EXISTS idx_users_verified ON users (verified) WHERE verified = TRUE;

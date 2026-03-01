ALTER TABLE users
ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users
SET username = LOWER(TRIM(username))
WHERE username IS NOT NULL;

UPDATE users
SET username = 'member_' || SUBSTRING(MD5(id::text) FROM 1 FOR 10)
WHERE username IS NULL OR LENGTH(TRIM(username)) = 0;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
ON users (LOWER(username));

ALTER TABLE users
ALTER COLUMN username SET NOT NULL;

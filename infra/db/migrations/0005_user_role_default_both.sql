DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'both'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'both' BEFORE 'seeker';
  END IF;
END
$$;

UPDATE users
SET role = 'both'::user_role,
    updated_at = now()
WHERE role IN ('seeker'::user_role, 'provider'::user_role);

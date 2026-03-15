DO $$ BEGIN
  CREATE TYPE media_context AS ENUM (
    'profile_gallery',
    'profile_avatar',
    'job_attachment',
    'verification_document'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE media_assets
ADD COLUMN IF NOT EXISTS context media_context NOT NULL DEFAULT 'profile_gallery'::media_context;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS service_skills JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS active_avatar_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS skill_snapshot JSONB;

UPDATE media_assets
SET context = CASE
  WHEN job_id IS NOT NULL THEN 'job_attachment'::media_context
  ELSE 'profile_gallery'::media_context
END
WHERE context IS NULL
   OR context NOT IN (
     'profile_gallery'::media_context,
     'profile_avatar'::media_context,
     'job_attachment'::media_context,
     'verification_document'::media_context
   );

UPDATE profiles p
SET service_skills = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'jobName', skill_name,
        'proficiency', 'intermediate',
        'source', 'custom'
      )
    ),
    '[]'::jsonb
  )
  FROM unnest(COALESCE(p.service_categories, '{}'::text[])) AS skill_name
)
WHERE (p.service_skills IS NULL OR p.service_skills = '[]'::jsonb)
  AND cardinality(COALESCE(p.service_categories, '{}'::text[])) > 0;

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_context_state
  ON media_assets (owner_user_id, context, state);

CREATE INDEX IF NOT EXISTS idx_profiles_active_avatar
  ON profiles (active_avatar_media_id);

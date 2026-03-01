ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_location_latitude_range'
  ) THEN
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_location_latitude_range
    CHECK (location_latitude IS NULL OR (location_latitude >= -90 AND location_latitude <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_location_longitude_range'
  ) THEN
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_location_longitude_range
    CHECK (location_longitude IS NULL OR (location_longitude >= -180 AND location_longitude <= 180));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_jobs_location_lat_lon
ON jobs (location_latitude, location_longitude)
WHERE location_latitude IS NOT NULL AND location_longitude IS NOT NULL;

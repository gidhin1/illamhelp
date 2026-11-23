ALTER TABLE jobs ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', title), 'A') ||
  setweight(to_tsvector('simple', category), 'A') ||
  setweight(to_tsvector('simple', location_text), 'B') ||
  setweight(to_tsvector('simple', description), 'C')
) STORED;

CREATE INDEX idx_jobs_search_vector ON jobs USING GIN (search_vector);

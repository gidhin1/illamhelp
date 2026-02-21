# Database Bootstrap

Initial schema is in:

- `migrations/0001_init.sql`
- `migrations/0002_add_access_request_id_to_consent_grants.sql`
- `migrations/0003_scale_indexes_and_constraints.sql`

Apply against local PostgreSQL:

```bash
psql "$DATABASE_URL" -f infra/db/migrations/0001_init.sql
psql "$DATABASE_URL" -f infra/db/migrations/0002_add_access_request_id_to_consent_grants.sql
psql "$DATABASE_URL" -f infra/db/migrations/0003_scale_indexes_and_constraints.sql
```

Or from project root with running Docker stack:

```bash
make migrate
```

`make migrate` is safe to rerun:

- Applies `0001` only when base tables are missing.
- Always applies `0002` and `0003` (idempotent `IF NOT EXISTS`/constraint guards).

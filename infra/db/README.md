# Database Migrations

The Spring Boot API owns database initialization through Flyway. The only current
schema script is `migrations/V0001__baseline.sql`, embedded in the API jar at build
time.

- On an empty database, API startup creates the schema by applying the baseline.
- On an existing Flyway-managed database, API startup applies only new migrations.
- Applied migration files must not be edited; add a new versioned migration instead.
- Hibernate runs with `ddl-auto=validate` and checks mappings after Flyway finishes.

This repository moved from manual pre-Flyway SQL application during development.
Existing local Docker database volumes should be reset once before starting the
Flyway-enabled API. No automatic baselining is enabled because that would be unsafe
for production databases.

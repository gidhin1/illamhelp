# Local Infrastructure

Docker services provisioned via `infra/docker-compose.yml`.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching and sessions |
| MinIO | 9000 (API), 9001 (Console) | Object storage |
| NATS | 4222 | Event streaming (JetStream) |
| Keycloak | 8080 | Identity and access management |
| OPA | 8181 | Policy enforcement (consent decisions) |
| OpenSearch | 9200 | Search (full stack only) |
| ClamAV | 3310 | Virus scanning (full stack only) |

## Start

```bash
make init-env     # Create .env from template (first time)
make doctor       # Environment diagnostics
make up           # Start all services
make up-core      # Start core services only (lower memory)
make up-auth      # Start Keycloak only
```

Before starting, set credentials in `.env` (do not commit):

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`

## Keycloak Bootstrap

`make up` and `make up-core` automatically run `scripts/keycloak-dev-bootstrap.sh`, which:

1. Ensures the `illamhelp` realm exists with SSL disabled for local dev
2. Creates realm roles: `both`, `seeker`, `provider`, `admin`, `support`
3. Creates the `illamhelp-api` public client

If auth endpoints return `HTTPS required` or `Invalid client credentials`:

```bash
make keycloak-bootstrap
```

## DB Migrations

Schema creation and upgrades run inside the Spring Boot API through Flyway at
startup. The current pre-production schema is a single baseline in
`infra/db/migrations/V0001__baseline.sql`, embedded into the Maven-built API jar.
After a data-bearing environment is deployed, preserve the baseline and add new
versioned migration files for later changes.

## Stop / Reset

```bash
make down           # Stop all services and remove volumes
make reset-backend  # Full wipe: containers + volumes (all project name variants)
```

After a reset, restart with:

```bash
make up-core
make api-dev
```

## macOS Notes

- Docker Desktop (or Colima) with ≥6 GB memory for full stack
- OpenSearch memory tuned via `OPENSEARCH_JAVA_OPTS` in `.env`
- ClamAV runs `linux/amd64` on Apple Silicon via `CLAMAV_PLATFORM` env

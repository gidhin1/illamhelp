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
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`
- `NATS_USER`, `NATS_PASSWORD`
- `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD`, `OPENSEARCH_INITIAL_ADMIN_PASSWORD`

All published development ports bind to `127.0.0.1` only. Redis and NATS
require credentials, and OpenSearch runs with its security plugin enabled.

## Keycloak Bootstrap

`make up` and `make up-core` automatically run `scripts/keycloak-dev-bootstrap.sh`, which:

1. Ensures the `illamhelp` realm exists with SSL disabled for local dev
2. Creates the `illamhelp-api` public client
3. Creates client-scoped roles on `illamhelp-api`: `both`, `seeker`, `provider`, `admin`, `support`

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

## Production Launch Gate

Swagger/OpenAPI remains intentionally accessible while this application is
pre-production. Before any public production deployment, protect `/api/docs`
and `/v3/api-docs` with credentials or disable them, and verify this in the
release security checklist.

## Image Security Exceptions

Docker image references are pinned by digest so locally tested content cannot
drift silently. On 2026-05-25, fresh pulls of the current upstream
`postgres:18-alpine` and `minio/minio:latest` tags still resolved to images
reported by Trivy with critical Go component CVEs. These are temporary
upstream-image exceptions recorded in `infra/trivy-image-exceptions.txt`; they
must be removed as soon as rebuilt fixed images are published and must block a
production release if still present.

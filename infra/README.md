# Local Infrastructure

Services provisioned through `infra/docker-compose.yml`:

- PostgreSQL
- Redis
- MinIO (+ bucket initializer)
- NATS (JetStream enabled)
- OpenSearch (single node, security plugin disabled for local only)
- Keycloak
- OPA
- ClamAV

## Start

```bash
make init-env
make doctor
make up
```

Before `make up`, set credentials in `.env` (runtime only, do not commit):

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `KEYCLOAK_ADMIN`
- `KEYCLOAK_ADMIN_PASSWORD`

For lower-memory laptops (common on MacBook Air), start lighter core services:

```bash
make up-core
```

If you only need auth/register/login during development:

```bash
make up-auth
```

If register/login returns `HTTPS required` or `Invalid client credentials`, re-apply local Keycloak dev settings:

```bash
make keycloak-bootstrap
```

## Stop

```bash
make down
```

For a hard local wipe of backend persisted state (including stale volumes from older compose project names):

```bash
make reset-backend
```

## Default Local Endpoints

- API (planned): `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Keycloak: `http://localhost:8080`
- OpenSearch: `http://localhost:9200`
- NATS: `nats://localhost:4222`
- OPA: `http://localhost:8181`
- ClamAV: `localhost:3310`

## macOS Notes

- Use Docker Desktop (or Colima) with at least `6 GB` memory for full stack.
- OpenSearch uses `OPENSEARCH_JAVA_OPTS` from `.env` (default is tuned down for local use).
- ClamAV runs in `linux/amd64` mode on Apple Silicon via `CLAMAV_PLATFORM` env variable.

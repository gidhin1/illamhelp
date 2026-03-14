# API

NestJS + Fastify backend for IllamHelp.

## Modules

| Module | Description |
|--------|-------------|
| `auth` | Keycloak-backed registration, login, token refresh, logout |
| `profiles` | User profiles with PII encryption, verification requests |
| `jobs` | Job posting, applications, booking lifecycle |
| `connections` | Request/accept/decline/block connections |
| `consent` | Mutual-approval PII access with OPA policy enforcement |
| `media` | Upload tickets, moderation queue, public serving |
| `notifications` | Event-driven notification triggers + read management |
| `audit` | Consent and action audit trail |

## Start

```bash
make backend-start    # Infra + migrations + API watch mode
# or
make api-dev          # API only (infra must already be running)
```

API: `http://localhost:4000`
Swagger: `http://localhost:4000/api/docs` (enabled in dev)

## Build

```bash
make api-build
# or
pnpm --filter @illamhelp/api build
```

## Public Endpoints

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

All other endpoints require `Authorization: Bearer <access_token>`.

## Runtime Notes

- All IDs are UUIDs
- Actor identity from JWT `sub` — request bodies never carry actor IDs
- Registration assigns default `both` capability role
- Password policy: ≥1 uppercase, ≥1 lowercase, ≥1 number
- `PROFILE_PII_ENCRYPTION_KEY` required for profile PII fields
- User-scoped queries: connections, consent requests, and grants are filtered to the authenticated user
- Consent decisions enforced through OPA policy evaluation
- Consent actions emit audit events for full traceability

## Environment

Key variables (see `.env.example` for full list):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin credentials |
| `KEYCLOAK_CLIENT_SECRET` | API client secret |
| `PROFILE_PII_ENCRYPTION_KEY` | PII field encryption key |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `AUTH_STARTUP_CHECK_ENABLED` | Validate Keycloak at boot (default: true) |
| `SWAGGER_ENABLED` | Enable Swagger UI (default: true in dev) |

## Lint

```bash
pnpm --filter @illamhelp/api lint
```

## Test

```bash
pnpm --filter @illamhelp/api test
```

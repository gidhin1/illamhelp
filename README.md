# IllamHelp

Project planning and architecture documentation for an enterprise-grade mobile marketplace that connects households with verified domestic workers across Kerala and Tamil Nadu.

This baseline is designed around free/open-source tools and security-first architecture.

## Monorepo Structure

- `api`: NestJS + Fastify backend foundation.
- `mobile`: React Native app workspace placeholder.
- `admin`: Next.js admin workspace placeholder.
- `packages`: Shared contracts and reusable libraries.
- `infra`: Local Docker stack, DB migrations, and policy files.
- `docs`: Product, architecture, and governance documents.

## Documentation Index

- `docs/PROJECT_SCOPE.md`: Business goals, user types, MVP scope, and non-goals.
- `docs/ARCHITECTURE.md`: System architecture, domain modules, data flow, and scaling strategy.
- `docs/TECH_STACK_2026.md`: Recommended stack and version posture (validated against current official sources).
- `docs/TASKS_AND_MILESTONES.md`: Delivery phases, implementation tasks, and acceptance criteria.
- `docs/PROJECT_RULES.md`: Product, engineering, security, and operations rules.
- `docs/MEDIA_MODERATION_POLICY.md`: Strict image/video upload, moderation, approval, and public display policy.
- `docs/PII_CONSENT_POLICY.md`: Mutual-approval contact sharing, owner consent grants, and revocation rules.
- `docs/IMPLEMENTATION_LOG.md`: Execution log for milestone progress.
- `docs/MAC_SETUP.md`: macOS setup, diagnostics, and low-memory startup options.
- `bruno/README.md`: Bruno API collection usage.

## Quick Start

1. Copy env template: `cp .env.example .env`
2. Fill runtime credentials in `.env` (`POSTGRES_*`, `MINIO_ROOT_*`, `KEYCLOAK_ADMIN*`, `DATABASE_URL`)
3. Run environment diagnostics: `make doctor`
4. Start local infrastructure:
   - Full stack: `make up`
   - Lower-memory core stack (includes Keycloak for auth): `make up-core`
   - Only Keycloak (if auth endpoints fail with connection refused): `make up-auth`
   - Re-apply local Keycloak dev settings (HTTP local + realm SSL policy + client bootstrap): `make keycloak-bootstrap`
5. Install dependencies: `pnpm install`
6. Run API in watch mode (from repo root): `pnpm dev:api`
7. Alternative watch command (direct package filter): `pnpm --filter @illamhelp/api dev`
8. Optional production-style run for API:
   - Build: `pnpm --filter @illamhelp/api build`
   - Start compiled app: `pnpm --filter @illamhelp/api start`
9. Apply DB migrations: `make migrate`

If local backend state gets stuck or persists unexpectedly, do a full backend wipe:

```bash
make reset-backend
make up-core
make migrate
```

## Working Model

- Build fast with a modular monolith and clear domain boundaries.
- Extract high-load domains into services only when metrics justify it.
- Keep trust and safety (verification, moderation, disputes) as first-class features from day one.
- Prefer free/open-source tooling for all core platform capabilities.

## API Security Baseline

- `/api/v1/health` is public.
- `/api/v1/auth/register` and `/api/v1/auth/login` are public.
- All other API routes require a Keycloak bearer token.
- Actor identity is taken from JWT `sub`; protected endpoints do not trust actor IDs from request bodies.
- Auth startup preflight is enabled by default and validates/repairs Keycloak client config at boot (`AUTH_STARTUP_CHECK_ENABLED=false` to disable).

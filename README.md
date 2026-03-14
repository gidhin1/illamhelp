# IllamHelp

Enterprise-grade mobile marketplace connecting households with verified domestic workers across Kerala and Tamil Nadu. Built with security-first architecture and free/open-source tooling.

## Monorepo

| Package | Tech | Port |
|---------|------|------|
| `api/` | NestJS + Fastify | 4000 |
| `web/` | Next.js | 3001 |
| `admin/` | Next.js | 3003 |
| `mobile/` | React Native + Expo | — |
| `packages/ui-tokens/` | Design tokens (CSS + JSON) | — |
| `infra/` | Docker Compose (Postgres, Redis, MinIO, NATS, Keycloak, OPA) | — |

## Quick Start

```bash
make init-env          # Create .env from template
# Fill credentials in .env (see .env.example)
make deps              # Install all dependencies
make dev               # Run full local stack (tests → infra → API → web)
```

## Core Make Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Full startup: unit tests → infra → migrations → API + Web |
| `make backend-start` | Infra + migrations + API (watch mode) |
| `make dev-web` | Web app dev server (auto-detects free port) |
| `make dev-admin` | Admin portal dev server |
| `make dev-mobile` | Expo mobile dev server |
| `make up` | Start all Docker services |
| `make up-core` | Start core services only (lower memory) |
| `make down` | Stop all Docker services |
| `make migrate` | Apply DB migrations |
| `make health` | API health check |
| `make ui-test-web` | Playwright web E2E tests |
| `make ui-test-admin` | Playwright admin E2E tests |
| `make ui-test-mobile` | Maestro mobile E2E tests (iOS + Android) |
| `make ui-test` | Run all UI E2E suites |
| `make clean` | Remove all build/test artifacts |
| `make reset-backend` | Full backend wipe (volumes + containers) |
| `make doctor` | Environment diagnostics |
| `make preflight` | Startup preflight checks |

## Documentation

- `docs/ARCHITECTURE.md` — System architecture and domain modules
- `docs/PROJECT_SCOPE.md` — Business goals, user types, MVP scope
- `docs/PROJECT_RULES.md` — Engineering, security, and operations rules
- `docs/TECH_STACK_2026.md` — Recommended stack and version posture
- `docs/UI_STANDARD.md` — Shared UI standards and design tokens
- `docs/MAC_SETUP.md` — macOS setup and diagnostics

Each subfolder contains its own `README.md` with deeper setup, environment overrides, and testing instructions.

## API Security

- `/api/v1/health`, `/api/v1/auth/register`, `/api/v1/auth/login` are public
- All other routes require Keycloak bearer token
- Actor identity from JWT `sub` — request bodies never carry actor IDs
- Swagger UI at `http://localhost:4000/api/docs` (enabled in dev)

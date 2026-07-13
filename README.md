# IllamHelp

Enterprise-grade mobile marketplace connecting households with verified domestic workers across Kerala and Tamil Nadu. Built with security-first architecture and free/open-source tooling.

## Monorepo

| Package | Tech | Port |
|---------|------|------|
| `api-java/` | Spring Boot + Maven + Spring Data JPA | 4000 |
| `web/` | Next.js | 3001 |
| `admin/` | Next.js | 3003 |
| `mobile/` | React Native + Expo | — |
| `packages/ui-tokens/` | Design tokens (CSS + JSON) | — |
| `infra/` | Docker Compose, Kubernetes, Helm, and container definitions | — |
| `charts/` | Helm charts for the application and local infrastructure | — |

## Prerequisites

- Docker Desktop or another Docker-compatible daemon
- Java, Node.js, and Corepack
- `kind`, `kubectl`, and Helm for the Kubernetes workflow

Check the local toolchain before starting:

```bash
make doctor
```

`make doctor` reports optional tools separately. Resolve any required `MISS` result for the workflow you intend to use.

## First-Time Setup

```bash
make init-env          # Create .env from template
# Fill credentials in .env (see .env.example)
make deps              # Install all dependencies
```

Keep `.env` local and never commit its credentials.

## Docker Compose Development

Use this workflow for normal source development and hot reload. The Docker daemon must be running.

```bash
make dev
```

`make dev` runs preflight checks and unit tests, starts the local infrastructure, and launches the Spring Boot API and web application. To start parts of the system separately:

```bash
make backend-start     # Core infrastructure and Spring Boot API
make dev-web           # Web development server
make dev-admin         # Admin development server
make dev-mobile        # Expo development server
```

Default development endpoints:

| Surface | URL |
|---------|-----|
| API health | `http://localhost:4000/api/v1/health` |
| API documentation | `http://localhost:4000/api/docs` |
| Web | `http://localhost:3001` |
| Admin | `http://localhost:3003` |
| gRPC-Web proxy | `http://localhost:9091` |

The web and admin commands select the next free port when their default port is occupied.

## Local Kubernetes

Use this workflow to validate production-style container images and Helm deployment locally. Docker, kind, kubectl, and Helm must be available.

```bash
make k8s-template       # Lint charts and render manifests
make k8s-create         # Create the kind cluster once
make k8s-build-load     # Build app images and load them into kind
make k8s-up             # Install or upgrade infrastructure and app releases
make k8s-status         # Show Kubernetes workloads and services
make k8s-smoke          # Check API, web, and admin from inside the cluster
make k8s-port-forward   # Expose the applications on localhost; blocks until Ctrl-C
```

Port-forwarded Kubernetes endpoints:

| Surface | URL |
|---------|-----|
| Web | `http://localhost:3000` |
| Admin | `http://localhost:3003` |
| API health | `http://localhost:4000/api/v1/health` |
| gRPC-Web proxy | `http://localhost:9091` |

Run `make k8s-port-forward` in a separate terminal before opening these URLs. See [`infra/kubernetes.md`](infra/kubernetes.md) for architecture, secrets, ingress, rollback, and production notes.

## Core Make Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Run preflight and unit tests, then start Compose infrastructure, API, and web |
| `make backend-start` | Infra + Spring Boot API (Flyway runs at startup) |
| `make dev-web` | Web app dev server (auto-detects free port) |
| `make dev-admin` | Admin portal dev server |
| `make dev-mobile` | Expo mobile dev server |
| `make up` | Start all Docker Compose services and bootstrap Keycloak |
| `make up-core` | Start core Compose services and bootstrap Keycloak |
| `make down` | Stop Compose services and delete their local volumes |
| `make api-build` | Run Maven tests and package the API jar |
| `make health` | Check the API currently exposed on `localhost:4000` |
| `make ui-test-web` | Playwright web E2E tests |
| `make ui-test-admin` | Playwright admin E2E tests |
| `make ui-test-mobile` | Fast Playwright E2E tests against Expo Web mobile UI |
| `make ui-test` | Run all Playwright UI E2E suites |
| `make clean` | Remove all build/test artifacts |
| `make reset-backend` | Delete Compose backend containers and local data volumes |
| `make doctor` | Environment diagnostics |
| `make preflight` | Startup preflight checks |

## Kubernetes Make Commands

| Command | What it does |
|---------|-------------|
| `make k8s-template` | Lint Helm charts and render manifests into `/tmp` |
| `make k8s-create` | Create the local `illamhelp` kind cluster if absent |
| `make k8s-build-load` | Build API, web, and admin images and load them into kind |
| `make k8s-up` | Install or upgrade the local infrastructure and application releases |
| `make k8s-status` | List pods, services, and ingress resources |
| `make k8s-smoke` | Run in-cluster health checks for API, web, and admin |
| `make k8s-port-forward` | Forward web, admin, API, and gRPC-Web ports until interrupted |
| `make k8s-logs` | Follow logs from application release containers |
| `make k8s-down` | Uninstall both Helm releases and delete the kind cluster and its data |

## Cleanup Safety

The following commands remove local data:

- `make down` removes Docker Compose volumes.
- `make reset-backend` removes known backend containers and volumes.
- `make k8s-down` deletes the kind cluster and all data stored inside it.

`make clean` removes generated build and test artifacts but does not delete database volumes or the Kubernetes cluster.

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
- Spring Data JPA owns application persistence; Flyway applies the single initial baseline and future versioned schema upgrades at API startup.

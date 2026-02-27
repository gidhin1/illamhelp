# Mac Setup Guide (MacBook Air)

## 1) Install prerequisites

Use Homebrew where possible:

```bash
brew install node@24 pnpm
```

Install Docker Desktop (or Colima if you prefer).

## 2) Verify environment

From project root:

```bash
make doctor
```

## 3) Docker memory settings (important on MacBook Air)

- Recommended Docker memory for full stack: `6 GB` minimum.
- If your machine is under memory pressure, start with core services first.

## 4) Start services

Core profile (lighter):

```bash
make up-core
```

Auth-only helper (starts only Keycloak):

```bash
make up-auth
```

If Keycloak returns `HTTPS required` or `Invalid client credentials` on register/login, run:

```bash
make keycloak-bootstrap
```

Full profile:

```bash
make up
```

## 5) Start API

```bash
make deps
make migrate
make api-dev
```

If data persists after `make down`, run a hard reset:

```bash
make reset-backend
make up-core
make migrate
```

Health check:

```bash
make health
```

## Apple Silicon Notes

- Most configured images provide ARM64 variants.
- ClamAV is forced to `linux/amd64` in compose via `CLAMAV_PLATFORM` for compatibility.
- If one image falls back to x86 emulation, startup can be slower.
- OpenSearch is the heaviest container; reduce heap via `.env`:
  - `OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m` (for very constrained laptops)
- If a specific image has no ARM64 variant, run with emulation:
  - `DOCKER_DEFAULT_PLATFORM=linux/amd64 make up`

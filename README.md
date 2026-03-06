# IllamHelp

Project planning and architecture documentation for an enterprise-grade mobile marketplace that connects households with verified domestic workers across Kerala and Tamil Nadu.

This baseline is designed around free/open-source tools and security-first architecture.

## Monorepo Structure

- `api`: NestJS + Fastify backend foundation.
- `mobile`: React Native + Expo mobile app (Android + iOS).
- `admin`: Next.js admin operations portal (moderation + consent/audit oversight).
- `web`: Next.js user-facing web app.
- `packages`: Shared contracts and reusable libraries.
- `infra`: Local Docker stack, DB migrations, and policy files.
- `docs`: Product, architecture, and governance documents.

## Documentation Index

- `docs/PROJECT_SCOPE.md`: Business goals, user types, MVP scope, and non-goals.
- `docs/ARCHITECTURE.md`: System architecture, domain modules, data flow, and scaling strategy.
- `docs/TECH_STACK_2026.md`: Recommended stack and version posture (validated against current official sources).
- `docs/TASKS_AND_MILESTONES.md`: Delivery phases, implementation tasks, and acceptance criteria.
- `docs/PROJECT_RULES.md`: Product, engineering, security, and operations rules.
- `docs/UI_STANDARD.md`: Shared UI standards and design tokens.
- `docs/MEDIA_MODERATION_POLICY.md`: Strict image/video upload, moderation, approval, and public display policy.
- `docs/PII_CONSENT_POLICY.md`: Mutual-approval contact sharing, owner consent grants, and revocation rules.
- `docs/PROTOBUF_INTERNAL_EVENTS.md`: Hybrid contract strategy (JSON public APIs + Protobuf internal events/outbox).
- `docs/IMPLEMENTATION_LOG.md`: Execution log for milestone progress.
- `docs/MAC_SETUP.md`: macOS setup, diagnostics, and low-memory startup options.
- `bruno/README.md`: Bruno API collection usage.

## Quick Start

1. Create local env file: `make init-env`
2. Fill runtime credentials in `.env` (do not commit secrets):
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`,
`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_HTTP_TIMEOUT_MS`,
`TRUST_PROXY`, `BODY_LIMIT_BYTES`,
`PROFILE_PII_ENCRYPTION_KEY`
3. Install dependencies: `make deps`
4. Run environment diagnostics: `make doctor`
5. Run startup preflight checks: `make preflight`

## Env Template (Minimal)

```env
POSTGRES_USER=
POSTGRES_PASSWORD=
DATABASE_URL=
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_QUARANTINE_BUCKET=illamhelp-quarantine
KEYCLOAK_ADMIN=
KEYCLOAK_ADMIN_PASSWORD=
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_HTTP_TIMEOUT_MS=8000
TRUST_PROXY=false
BODY_LIMIT_BYTES=1048576
PROFILE_PII_ENCRYPTION_KEY=
```

## One-Command Dev

```bash
make dev
```

Notes:
`make dev` runs unit tests first, then starts infra, bootstraps Keycloak, runs migrations, and launches API + web.
`make dev` now uses the full infra stack by default (`make up`).
Use `DEV_PROFILE=core make dev` only if you intentionally want the lower-memory core stack (without OpenSearch/ClamAV).
Skip unit tests only when needed: `SKIP_UNIT_TESTS=1 make dev`.
Mobile still runs separately: `make dev-mobile`.
`make dev`, `make backend-start`, and UI test make targets run `make preflight` first and fail fast on missing critical env/runtime dependencies.

## Backend Start (Infra + API)

Single command:

```bash
make backend-start
```

(`make backend` is an alias)

1. Start local infrastructure.
Full stack: `make up`
Lower-memory core stack (includes Keycloak for auth): `make up-core`
Only Keycloak (if auth endpoints fail with connection refused): `make up-auth`
2. Bootstrap Keycloak dev settings (HTTP local + realm SSL policy + client bootstrap):
`make keycloak-bootstrap`
   - This creates realm roles `both`, `seeker`, `provider`, `admin`, and `support` in realm `illamhelp`.
   - Admin portal access requires `admin` or `support` role in realm `illamhelp`.
   - `realm-admin` and common `realm-management` admin roles are accepted as admin aliases for compatibility.
3. Apply DB migrations: `make migrate`
4. Start API (watch mode): `make api-dev`
5. Health check: `make health`
6. Swagger docs (enabled by default in non-production): `http://localhost:4000/api/docs`

## Frontend Start (Web + Mobile)

1. Web app (Next.js): `make dev-web`
URL (default): `http://localhost:3001`
Override port: `make dev-web WEB_PORT=3000`
Optional API base override: `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1 make dev-web`
If the selected web port is already in use, `make dev-web` automatically picks the next free port and prints it.
If Next.js lock file is stale, `make dev-web` removes it automatically. If another web dev process is still running, it prints the PID(s) to stop.
2. Admin app (Next.js): `make dev-admin`
URL (default): `http://localhost:3003`
Override port: `ADMIN_PORT=3010 make dev-admin`
Optional API base override: `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1 make dev-admin`
If you run API with a custom CORS allowlist, include your admin origin in `CORS_ORIGINS` (for example `http://localhost:3003`).
3. Mobile app (Expo): `make dev-mobile`
Android: `make dev-mobile-android`
iOS: `make dev-mobile-ios`
Optional API base override (real device/LAN): `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:4000/api/v1 make dev-mobile`
Clear Metro cache (if bundling uses stale modules): `make dev-mobile-clear`
Reset Expo local state + clear cache: `make dev-mobile-reset`

## UI E2E Tests (Web: Playwright, Mobile: Detox)

Install web test browser once:

```bash
make ui-install
```

Web UI full flow (auth, jobs, connections, consent):

```bash
make ui-test-web
```

Admin UI suite (moderation + consent/audit timeline):

```bash
make ui-test-admin
```

Initialize native mobile projects for Detox (first time or after Expo config changes):

```bash
make mobile-native-init
```

Native mobile full flow (iOS simulator):

```bash
make ui-test-mobile-ios
```

Native mobile full flow (Android emulator):

```bash
make ui-test-mobile-android
```

Run both mobile platforms:

```bash
make ui-test-mobile
```

Run all UI suites:

```bash
make ui-test
```

## Run CI Workflow Locally

Run the same GitHub CI workflow file (`.github/workflows/ci.yml`) on your machine using `act`:

```bash
make ci-local
```

Prerequisites:
- Docker must be running.
- `act` must be installed: https://github.com/nektos/act

Notes:
- `make ui-test-web`, `make ui-test-admin`, `make ui-test-mobile-ios`, `make ui-test-mobile-android`, `make ui-test-mobile`, and `make ui-test` auto-run startup preflight. Web/mobile targets also auto-run backend prerequisites (`make up-core` + `make migrate`).
- Web tests stay on Playwright.
- Mobile tests run on native iOS Simulator and Android Emulator with Detox.
- Android Detox runs against the release APK by default (`android.emu.release`) so Metro is not required.
- If you intentionally switch Android Detox to debug config, keep Metro running (`make dev-mobile`) or you will see `Unable to load script`.
- If Android Detox startup fails, inspect `mobile/artifacts/detox/android-logcat.log`.
- App-focused Android logs are also exported automatically:
  `mobile/artifacts/detox/android-app.log`, `mobile/artifacts/detox/android-crash.log`, `mobile/artifacts/detox/android-anr.log`.
- Ensure Xcode, CocoaPods, and Android Studio emulators are installed before running Detox targets.

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
- Swagger UI is enabled by default in local/dev (`SWAGGER_ENABLED=true`, `SWAGGER_PATH=api/docs`).

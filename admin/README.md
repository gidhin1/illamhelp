# Admin Portal

Next.js operations console for IllamHelp staff with `admin` and `support` roles.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: CSS design system consuming `@illamhelp/ui-tokens`
- **Data tables**: `@tanstack/react-table` for high-volume operational views
- **Navigation**: Responsive sidebar (desktop) + bottom tab bar (mobile)
- **Theme**: Purple-Blue brand (`#6A5ACD`)

## Start

```bash
make dev-admin
```

Default URL: `http://localhost:3003`

### Environment Overrides

```bash
# Custom port
ADMIN_PORT=3010 make dev-admin

# Custom API base
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1 make dev-admin
```

When the API has an explicit CORS allowlist, include the admin origin in `CORS_ORIGINS`.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with KPI cards for pending workflows |
| `/moderation` | Media moderation queue with master-detail review |
| `/verifications` | Identity verification review and approval |
| `/audit` | Consent and audit event log viewer |

## Access Control

- Requires `admin` or `support` realm role in Keycloak `illamhelp` realm
- `realm-admin` and `realm-management` admin roles are also accepted

## Build

```bash
pnpm --filter @illamhelp/admin build
```

## Lint

```bash
pnpm --filter @illamhelp/admin lint
```

## E2E Tests (Playwright)

From repo root:

```bash
make ui-install       # Install Chromium (first time)
make ui-test-admin    # Run admin E2E suite
```

See `tests/playwright/README.md` for environment overrides and debug options.

# Web App

Next.js user-facing web application for IllamHelp seekers and providers.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: CSS design system consuming `@illamhelp/ui-tokens`
- **Data tables**: `@tanstack/react-table` for high-volume tabular views
- **Typography**: Inter (body), Space Grotosk (display)
- **Theme**: Purple-Blue brand (`#6A5ACD`)

## Start

```bash
make dev-web
```

Default URL: `http://localhost:3001`

### Environment Overrides

```bash
# Custom port
make dev-web WEB_PORT=3000

# Custom API base
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1 make dev-web
```

If the selected port is busy, `make dev-web` auto-picks the next free port.
If a stale Next.js lock file exists, it is removed automatically.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home feed with KPI cards and job activity |
| `/auth/login` | Login |
| `/auth/register` | Registration |
| `/jobs` | Job board: create, apply, manage, DataTable views |
| `/connections` | Search + connect with people, manage requests |
| `/consent` | Privacy controls: request/grant/revoke data access |
| `/notifications` | Activity feed with read/unread management |
| `/profile` | Profile view with media uploads and activity log |
| `/verification` | Identity verification submission |

## Architecture

- **Navigation**: Responsive sidebar (desktop) + bottom tab bar (mobile web)
- **Layout**: 3-column PageShell (sidebar → main feed → right sidebar)
- **Data**: All data fetched via `@/lib/api` functions using bearer tokens
- **Components**: Shared primitives in `src/components/ui/primitives.tsx`

## Build

```bash
pnpm --filter @illamhelp/web build
```

## Lint

```bash
pnpm --filter @illamhelp/web lint
```

## E2E Tests (Playwright)

From repo root:

```bash
make ui-install      # Install Chromium (first time)
make ui-test-web     # Run web E2E suite
```

See `tests/playwright/README.md` for environment overrides and debug options.

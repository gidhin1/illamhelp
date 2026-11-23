# Playwright UI E2E

## Suites

- `playwright.web.config.ts`: Web app UI flow on desktop Chromium.
- `playwright.admin.config.ts`: Admin portal UI flow on desktop Chromium.
- `playwright.mobile.config.ts`: Mobile React Native UI rendered through Expo Web at a phone viewport.
- `playwright.migration.config.ts`: Browser and viewport regressions for the member web app and admin portal across Chromium, WebKit, and Firefox.

## Flows covered

- Register / Login
- Jobs create + list
- Job apply + accept + booking start + complete
- Job application withdrawal + reapplication and pre-assignment cancellation
- Connection request + accept
- Consent request + grant + revoke + can-view checks
- Admin moderation queue review
- Admin consent + audit timeline lookup
- Admin verification review end-to-end (member submit -> admin approve/reject -> user notification)
- Mobile account validation, registration, authenticated navigation, job creation, profile editing, and sign out

## Commands

From repo root:

```bash
make ui-install
make ui-test-web
make ui-test-admin
make ui-test-mobile
```

Build the web and admin apps before running the browser and viewport suite.
Signed-in cases require the local backend and their fixture credentials.

```bash
corepack pnpm --filter @illamhelp/web build
corepack pnpm --filter @illamhelp/admin build
corepack pnpm exec playwright install chromium webkit firefox
corepack pnpm run test:ui:migration
```

Set `PW_MIGRATION_AUTH=true` to include member workflows with real UI
registration. Set `PW_MIGRATION_ADMIN=true` and supply the temporary staff
fixture credentials to include the authenticated admin display sweep. The
browser suite can also use existing production servers with
`PW_AUDIT_EXTERNAL=true`, `PW_AUDIT_MEMBER_ORIGIN`, and
`PW_AUDIT_ADMIN_ORIGIN`. Set `PW_FIREFOX_WS_ENDPOINT` when using a matching
Playwright Firefox server for local browser coverage. Set
`PW_CAPTURE_DISPLAY=true` to save screenshots for passing display cases as well.

The smoke tests create their own members, job posts, and alerts. Authenticated
browser checks use visible sign-in, sign-out, and consent controls.

## Environment overrides

- `PW_API_BASE_URL` (default: `http://localhost:4010/api/v1`)
- `PW_API_BASE_ORIGIN` (default: `http://localhost:4010`)
- `PW_WEB_BASE_URL` (default: `http://localhost:3100`)
- `PW_ADMIN_BASE_URL` (default: `http://localhost:3103`)
- `PW_ADMIN_API_BASE_ORIGIN` (default: `http://localhost:4011`)
- `PW_ADMIN_API_BASE_URL` (default: `http://localhost:4011/api/v1`)
- `PW_MOBILE_BASE_URL` (default: `http://localhost:3102`)
- `PW_MOBILE_API_BASE_ORIGIN` (default: `http://localhost:4012`)
- `PW_MOBILE_API_BASE_URL` (default: `http://localhost:4012/api/v1`)
- `PW_REUSE_EXISTING_SERVERS` (`true` by default outside CI; set `false` to force Playwright-started servers)
- If a local dev server is already reachable, Playwright auto-detects it and reuses it. The default dev ports are `4000` for the API, `3000` for web, `3003` for admin, and `3002` for mobile.
- `PW_AUTH_RATE_LIMIT_MAX` (default: `2000` for Playwright-started API server)
- `PW_HEADLESS` (`false` by default so tests are visible; set `true` for headless)
- `PW_BROWSER_CHANNEL` (optional installed browser channel, such as `chrome`)
- `PW_VIDEO` (set to `off` when running with an installed browser without Playwright video helpers)

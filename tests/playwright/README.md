# Playwright UI E2E

## Suites

- `playwright.web.config.ts`: Web app UI flow on desktop Chromium.
- `playwright.admin.config.ts`: Admin portal UI flow on desktop Chromium.
- `playwright.mobile.config.ts`: Mobile React Native UI rendered through Expo Web at a phone viewport.

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
- `PW_REUSE_EXISTING_SERVERS` (`false` by default; set `true` to reuse already-running web/api servers)
- `PW_AUTH_RATE_LIMIT_MAX` (default: `2000` for Playwright-started API server)
- `PW_HEADLESS` (`false` by default so tests are visible; set `true` for headless)
- `PW_BROWSER_CHANNEL` (optional installed browser channel, such as `chrome`)
- `PW_VIDEO` (set to `off` when running with an installed browser without Playwright video helpers)

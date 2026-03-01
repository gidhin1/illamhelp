# Playwright UI E2E

## Suites

- `playwright.web.config.ts`: Web app UI flow on desktop Chromium.
- `playwright.admin.config.ts`: Admin portal UI flow on desktop Chromium.

## Flows covered

- Register / Login
- Jobs create + list
- Job apply + accept + booking start + complete
- Connection request + accept
- Consent request + grant + revoke + can-view checks
- Admin moderation queue review
- Admin consent + audit timeline lookup

## Commands

From repo root:

```bash
make ui-install
make ui-test-web
make ui-test-admin
```

## Environment overrides

- `PW_API_BASE_URL` (default: `http://localhost:4000/api/v1`)
- `PW_API_BASE_ORIGIN` (default: `http://localhost:4000`)
- `PW_WEB_BASE_URL` (default: `http://localhost:3000`)
- `PW_ADMIN_BASE_URL` (default: `http://localhost:3003`)
- `PW_REUSE_EXISTING_SERVERS` (`true` by default; set `false` to always start fresh)
- `PW_HEADLESS` (`false` by default so tests are visible; set `true` for headless)

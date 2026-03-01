# Admin Workspace

IllamHelp operations console for `admin` and `support` roles.

## Features in Sprint 3.4

- Role-gated admin shell (`admin` / `support` only).
- Media moderation queue with detail inspection and approve/reject actions.
- Consent + audit timeline lookup by member ID.

## Run

```bash
pnpm --filter @illamhelp/admin dev
```

Default URL: `http://localhost:3003`
When API CORS is explicitly configured, ensure `http://localhost:3003` (or your admin origin) is included in `CORS_ORIGINS`.

## Test

Playwright admin suite:

```bash
pnpm run test:ui:admin
```

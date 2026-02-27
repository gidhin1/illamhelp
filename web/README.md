# Web App

Next.js web app for IllamHelp seekers/providers with backend-wired flows.

## Start

```bash
make deps
make dev-web
```

Open `http://localhost:3000`.

## Environment

Optional API base override:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1 make dev-web
```

## Implemented backend coverage

- Auth: register/login/me
- Jobs: list/create/detail lookup from list
- Connections: list/request/accept
- Consent: requests/grants/request-access/grant/revoke/can-view
- Profile dashboard fed from authenticated APIs

## Notes

- Media moderation policy is represented in UI.
- Media upload/download API routes are pending backend implementation.

## Playwright Web E2E

From repo root:

```bash
make ui-install
make ui-test-web
```

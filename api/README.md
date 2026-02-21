# API Workspace

NestJS + Fastify backend foundation for IllamHelp.

## Current Modules

- `auth`
- `profiles`
- `jobs`
- `connections`
- `consent`
- `media`
- `audit`

## First Build Slice (in progress)

1. Job posting endpoint
2. Application endpoint
3. Mutual acquaintance request/accept
4. PII access request/grant/revoke
5. Consent-aware response masking

## Prototype Endpoints Added

- `GET /api/v1/health`
- `POST /api/v1/auth/register` (public)
- `POST /api/v1/auth/login` (public)
- `GET /api/v1/auth/me`
- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/connections`
- `POST /api/v1/connections/request`
- `POST /api/v1/connections/:id/accept`
- `GET /api/v1/consent/requests`
- `GET /api/v1/consent/grants`
- `POST /api/v1/consent/request-access`
- `POST /api/v1/consent/:requestId/grant`
- `POST /api/v1/consent/:grantId/revoke`
- `POST /api/v1/consent/can-view`

## Runtime Notes

- All user and entity IDs are UUIDs.
- `GET /api/v1/health`, `POST /api/v1/auth/register`, and `POST /api/v1/auth/login` are public.
- Other endpoints require `Authorization: Bearer <access_token>`.
- Acting user is derived from JWT `sub` (request bodies no longer carry requester/actor IDs).
- Registration supports `userType` values: `seeker`, `provider`, `both` (mapped to Keycloak roles).
- `GET /api/v1/connections`, `GET /api/v1/consent/requests`, and `GET /api/v1/consent/grants` are scoped to authenticated user records.
- Services now persist to PostgreSQL (no in-memory storage).
- `consent/can-view` decisions are enforced through OPA policy evaluation.
- Consent actions emit audit events in `audit_events` for request/grant/revoke/read checks.

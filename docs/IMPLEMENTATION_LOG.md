# Implementation Log

## 2026-02-21

Milestone 0 bootstrap started:

- Monorepo folders created (`mobile`, `admin`, `api`, `infra`, `packages`).
- Local infrastructure compose file added with core services.
- API scaffolded with NestJS + Fastify foundation and module boundaries.
- Initial database migration added for jobs, connections, PII consent, media moderation, and audit events.
- OPA policy baseline added for field-level PII access enforcement.
- CI workflow added with quality + security scans.
- Prototype endpoints added for jobs, connections, and consent grant/revoke flow.
- Added macOS-focused setup hardening (`make doctor`, `make up-core`, and `MAC_SETUP.md`).
- Replaced in-memory job/connection/consent services with PostgreSQL persistence.
- Wired OPA policy checks into consent visibility decision path (`consent/can-view`).
- Added Keycloak JWT guard as global auth (`/health` remains public) and `GET /api/v1/auth/me`.
- Removed temporary user bootstrap and now sync users from token `sub` on authenticated requests.
- Added audit writes for consent request/grant/revoke/read-check actions.
- Added strict DTO validation for jobs, connections, and consent request bodies.
- Scoped connection and consent list endpoints to authenticated user records only.
- Updated Bruno collection and API docs for token-derived actor identity and consent workflow.
- Added HTTP-level integration tests for JWT-required consent endpoints, owner-only grant/revoke, and revoke-enforced access denial.
- Added DB hardening migration (`0003`) with scale indexes and lifecycle consistency constraints for connections/consent/audit tables.
- Upgraded Bruno collection to fully automated E2E chaining with built-in assertions and added `scripts/run-bruno-e2e.sh`.
- Added public auth APIs for `register` and `login` with `userType` support (`seeker`, `provider`, `both`) via Keycloak role mapping.
- Removed hardcoded username/password defaults from project env/compose templates (runtime credentials only).

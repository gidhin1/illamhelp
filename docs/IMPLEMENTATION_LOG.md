# Implementation Log

## 2026-02-27

Recalibration checkpoint completed:

- Per-task status audit added to `docs/TASKS_AND_MILESTONES.md` using `Done / In Progress / Pending / Unknown`.
- Confirmed implemented backend slices: auth (`register/login/me`), jobs (`list/create`), connections (`list/request/accept`), consent (`request/grant/revoke/can-view`) with PostgreSQL persistence and OPA consent checks.
- Confirmed mobile + web UI coverage for auth/jobs/connections/consent user journeys against live backend APIs.
- Confirmed test harnesses exist for Bruno (API E2E), Playwright (web UI E2E), and Detox (mobile native E2E), with Detox stability still an active blocker.
- Logged major current gaps: profiles/media modules not implemented, no OpenTofu IaC path, no booking/search/payments modules, no admin implementation.
- Documented immediate next plan phases in milestones file to prioritize test stability and Milestone 1 completion.

Phase 1 stabilization work started:

- Mobile Jobs screen submit path hardened against stale state by reading latest input refs and validating payload client-side before API submit.
- Detox jobs-submit flow strengthened with pre-submit form snapshot validation and richer diagnostics when submit produces no backend effect.
- Playwright web full-flow stabilized for profile ID parsing by switching to explicit `data-testid` (`profile-user-id`) instead of brittle text-line parsing.
- Added startup preflight guard (`scripts/preflight.sh`) and wired it into critical make targets (`dev`, `backend-start`, `ui-test-*`) for fast failure on missing env/runtime prerequisites.
- Sanitized `.env.example` by removing non-empty credential values.

Phase 2 execution started:

- Added profile APIs (`GET /profiles/me`, `PATCH /profiles/me`, `GET /profiles/:userId`) with consent-aware visibility for contact fields and masked fallback for non-granted viewers.
- Extended registration profile bootstrap to persist masked contact metadata and seed profile contact fields.
- Implemented connection lifecycle endpoints `POST /connections/:id/decline` and `POST /connections/:id/block` and wired these actions in both web and mobile connection UIs.
- Redesigned privacy wording in web/mobile consent screens to user-facing language (no internal/business terminology in public-facing copy).
- Added editable profile forms in web and mobile apps backed by live profile API persistence.
- Implemented media upload Phase 2 foundation:
  - `POST /api/v1/media/upload-ticket` with strict metadata validation (kind/content-type/size/checksum/extension), DB persistence to `media_assets`, and audit event emission.
  - Signed MinIO upload URL generation for quarantine bucket objects (path-style S3 signature v4).
  - `POST /api/v1/media/:mediaId/complete` to verify object presence in storage and move state to `scanning`, with completion audit event.
  - `GET /api/v1/media` to list caller-owned uploaded assets.
  - Added `media.service.spec.ts` to catch validation and storage-config regressions early.
  - Wired media APIs to web/mobile clients and added user-facing upload surfaces:
    - Web profile page supports file selection, signed upload, completion, and review-state listing.
    - Mobile profile page supports API-path sample upload (ticket + PUT + complete) and review-state listing.
  - Extended Bruno automation with media upload-ticket + list assertions and added manual complete-upload request.
  - Added hybrid internal event contract foundation (JSON public APIs unchanged):
    - Added protobuf schemas under `proto/internal/events/v1/*`.
    - Added protobuf binary codecs in API and round-trip tests.
    - Added `internal_event_outbox` migration (`0004`) and internal event writer service.
    - Wired media upload flows to emit protobuf-backed outbox events (`upload_ticket_issued`, `upload_completed`).
- Security hardening follow-up:
  - Added stronger registration password policy (uppercase + lowercase + number).
  - Set safer API transport defaults (`TRUST_PROXY=false` by default and configurable request `BODY_LIMIT_BYTES`).
  - Added Keycloak request timeout guard (`KEYCLOAK_HTTP_TIMEOUT_MS`) to fail fast on auth dependency hangs.
- Phase 2 closure + automation coverage expansion:
  - Added `profiles.service.spec.ts` to validate consent-aware profile field masking (owner view, denied view, partial-grant view).
  - Expanded `media.service.spec.ts` with automated `completeUpload` verification-path tests (success and checksum-mismatch rejection).
  - Extended Bruno E2E chain with profile update + profile visibility checks across consent transitions:
    - `Profile View Provider (Before Grant)` expects hidden phone.
    - `Profile View Provider (After Grant)` expects revealed phone.
    - `Profile View Provider (After Revoke)` expects hidden phone again.
  - Extended Playwright web automation:
    - full-flow now uses people search query (name + location) instead of direct ID entry for connect.
    - full-flow now validates consent-aware profile visibility via API before grant, after grant, and after revoke.
    - full-flow now exercises web `block` action from Connections UI.
    - added dedicated `profile-media.spec.ts` to cover profile edit save + media upload/review state.

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
- Added public auth APIs for `register` and `login`; registration now defaults users to `both` and transaction context drives behavior.
- Removed hardcoded username/password defaults from project env/compose templates (runtime credentials only).
- Added initial frontend scaffolds: Next.js web app (`web`) and Expo-based mobile shell (`mobile`) with core flow screens and brand styling baseline.
- Added shared make-based developer commands (`make init-env`, `make deps`, `make api-dev`, `make dev-web`, `make dev-mobile*`, `make health`) and updated README command docs.
- Switched Expo mobile entry to explicit `index.js` registration to avoid pnpm `expo/AppEntry` path resolution issues.

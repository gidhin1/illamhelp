# Implementation Log

## 2026-03-06

Sprint 5 — Notification Trigger Wiring:

- **ConnectionsService**: Added 3 notification triggers (`connection_request_received`, `connection_request_accepted`, `connection_request_declined`). Imported `NotificationModule` into `ConnectionsModule`, injected `NotificationService`.
- **JobsService**: Added 3 notification triggers (`job_application_received`, `job_application_accepted`, `job_application_rejected`). Imported `NotificationModule` into `JobsModule`, injected `NotificationService`.
- **VerificationService**: Added 2 notification triggers (`verification_approved`, `verification_rejected`). Imported `NotificationModule` into `ProfilesModule`, injected `NotificationService`.
- **Pattern**: All notification calls use fire-and-forget (`.catch(() => {})`) to prevent blocking primary operations.
- **Test updates**: Added mock `NotificationService` to `connections.service.spec.ts`, `jobs.auth.integration.spec.ts`, and `verification.service.spec.ts`.
- TypeScript build clean, all 94 tests pass across 18 test files.

## 2026-03-05

Sprint 3 — In-App Notifications:

- **DB Migration**: Added `0012_notifications.sql` with `notification_type` enum (20 event types), `notifications` table with read tracking, composite index on `(user_id, created_at DESC)`, and partial index on unread.
- **NotificationService**: Core service with `create`, `createBatch`, `list` (paginated with unread count), `getUnreadCount`, `markRead`, and `markAllRead` operations.
- **Controller endpoints**: `GET /notifications` (paginated list with `unreadOnly` filter), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- **Module**: `NotificationModule` registered in `AppModule`, exports `NotificationService` for use by other modules.
- **Unit tests**: 9 tests in `notification.service.spec.ts` covering all operations.
- All 94 tests pass across 18 test files.

Sprint 1 bug fix and documentation sync:

- **BUG-007 FIXED**: Added UUID user existence check in `resolveInternalUserId()` in both `profiles.service.ts` and `media.service.ts`. These methods now query the `users` table and throw `NotFoundException` for non-existent UUID inputs, matching the pattern already used in `connections.service.ts` and `consent.service.ts`.
- **BUG-009 RECLASSIFIED**: Investigated and confirmed working as designed. `actorUserId` is UUID-typed and validated by `assertUuid()` in `AuditService`. System-initiated moderation events correctly use `metadata.actor: "system"` instead of the UUID-typed `actorUserId` field — this is the intended pattern for non-human actors.
- **Test mocks updated**: Updated `profiles.service.spec.ts` to account for the new UUID existence query added by BUG-007 fix. All 75 tests pass across 16 test files.
- **Documentation audit and sync**: Thoroughly reviewed all codebase to verify actual status of every bug and feature. Updated:
  - `CODEBASE_AUDIT_REPORT.md`: All 12 bugs marked FIXED, PERF-001 marked RESOLVED, auth refresh/logout marked Done, summary stats updated (0 active bugs, 14 active issues down from 27).
  - `FEATURE_PROPOSALS.md`: Auth flows marked Done in status table and prioritization summary.
  - `TASKS_AND_MILESTONES.md`: Calibration date updated to 2026-03-05, auth flows marked Done, search/applications/booking/rate-limits/AI moderation all marked Done in milestone 2, security gaps list updated.
  - `IMPLEMENTATION_LOG.md`: This entry added.

Sprint 2 — Provider Verification Workflow:

- **DB Migration**: Added `0011_verification_requests.sql` with `verification_status` enum, `verification_requests` table, indexes, and unique constraint preventing multiple active requests per user.
- **VerificationService**: Core service with submit, getMyVerification, listForAdmin, and review operations. On approval, automatically sets the user's `verified` flag via `ProfilesService.setVerified()`. All actions audit-logged with appropriate event types (`verification_request_submitted`, `verification_request_approved`, `verification_request_rejected`).
- **Provider endpoints**: `POST /profiles/me/verification` (submit request with document media IDs) and `GET /profiles/me/verification` (get latest status).
- **Admin endpoints**: `GET /admin/oversight/verifications?status=&limit=&offset=` (paginated list) and `POST /admin/oversight/verifications/:id/review` (approve/reject with notes). Role-gated to admin/support.
- **DTOs**: `SubmitVerificationDto` (documentType, documentMediaIds, notes) and `ReviewVerificationDto` (decision, notes).
- **Module wiring**: `VerificationService` registered in `ProfilesModule` with `AuditModule` import, exported for `AdminModule`.
- **Unit tests**: 10 tests in `verification.service.spec.ts` covering submit (happy path, duplicate prevention, empty docs), getMyVerification (found, not-found), review (approve+verified, reject, already-reviewed, not-found), and listForAdmin.
- **Documentation**: Updated `FEATURE_PROPOSALS.md`, `TASKS_AND_MILESTONES.md`, and `IMPLEMENTATION_LOG.md`.

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
- Phase 3 scope calibration updated:
  - Added Admin Portal MVP implementation to Phase 3 plan (admin/support role-gated console for user oversight, jobs/applications operations, media moderation queue, and consent/audit timeline views).
  - Added explicit Phase 3 deliverables for media upload lifecycle completion: async processing workers, AI moderation scoring, human admin review/approval actions, and approved-only publish gating.

## 2026-02-28

Phase 3 implementation started (Sprint 3.1):

- Added Phase 3 sprint checklist with task IDs to `docs/TASKS_AND_MILESTONES.md` (`P3-S1-*` to `P3-S4-*`).
- Started backend-first moderation/admin slice:
  - Added role-gated admin moderation API surface (`/api/v1/admin/media/...`) for queue/details/process/review.
  - Added moderation worker service flow for pending technical + AI moderation jobs.
  - Added human review decision endpoint path to move media assets to `approved`/`rejected` with audit events.
  - Current AI moderation scoring is a deterministic baseline heuristic to enable end-to-end workflow; external model-service integration remains a follow-up task.

Phase 3 implementation continued (Sprint 3.2):

- Implemented jobs application APIs:
  - `POST /api/v1/jobs/:id/apply`
  - `GET /api/v1/jobs/:id/applications`
  - `GET /api/v1/jobs/applications/mine`
  - `POST /api/v1/jobs/applications/:applicationId/accept`
  - `POST /api/v1/jobs/applications/:applicationId/reject`
  - `POST /api/v1/jobs/applications/:applicationId/withdraw`
- Implemented booking lifecycle APIs with transition guards:
  - `POST /api/v1/jobs/:id/booking/start`
  - `POST /api/v1/jobs/:id/booking/complete`
  - `POST /api/v1/jobs/:id/booking/cancel`
- Added migration `0006_job_applications_and_booking_lifecycle.sql`:
  - `job_applications.updated_at`
  - `jobs.assigned_provider_user_id`
  - `jobs.accepted_application_id`
  - indexes + consistency constraints for booking state.
- Added integration coverage:
  - `api/src/modules/jobs/jobs.auth.integration.spec.ts` for apply/accept/start/complete and guard failures.
- Extended automation flows:
  - Bruno E2E now runs application-to-completion chain between job posting and connection flow.
  - Playwright web full-flow now validates apply -> accept -> start -> complete via API path.

Phase 3 implementation continued (Sprint 3.3):

- Implemented OpenSearch-backed jobs search integration:
  - Added `GET /api/v1/jobs/search` with category/text/location/rating/status filters.
  - Added `JobsSearchService` with index bootstrap, document indexing, and ordered ID search.
  - Added DB fallback path when OpenSearch is unavailable or times out.
- Added geo search support for jobs:
  - Added migration `0007_jobs_geo_search_fields.sql` (`jobs.location_latitude`, `jobs.location_longitude`, index, and constraints).
  - Extended jobs create/list/read/search paths to persist and query geo coordinates.
- Added anti-abuse/rate-limit controls in API bootstrap middleware:
  - Auth login/register, jobs write endpoints, connections write endpoints, consent write endpoints, media write endpoints, and search endpoints.
  - Added standard limit headers (`X-RateLimit-*`) and `Retry-After` on throttled requests.
  - Added env configuration keys for per-surface limits and OpenSearch settings (`OPENSEARCH_*`, `*_RATE_LIMIT_*`).
- Added Sprint 3.3 regression checks:
  - `sliding-window-rate-limiter.spec.ts` for abuse-control behavior.
  - `jobs-search.service.spec.ts` for index payload correctness, query filter shaping, and timeout latency fallback.
  - Updated `jobs.auth.integration.spec.ts` for geo-aware SQL projection changes.

Phase 3 implementation continued (Sprint 3.4):

- Implemented Admin Portal MVP in `admin` workspace (Next.js):
  - Auth/session shell with strict `admin/support` role gating.
  - Moderation queue UI with queue filter, machine-process trigger, item detail panel, and approve/reject actions with reason codes + notes.
  - Consent + audit timeline lookup UI by member-facing user ID.
- Added backend admin oversight API:
  - `GET /api/v1/admin/oversight/timeline?memberId=&limit=`
  - Role-gated with `@Roles("admin", "support")` + `RolesGuard`.
  - Returns member summary, consent requests, consent grants, and audit events in a single payload for admin/support operations.
- Added admin Playwright automation:
  - `tests/playwright/playwright.admin.config.ts`
  - `tests/playwright/admin/admin-portal.spec.ts` covering role gate behavior, moderation review workflow, and timeline lookup rendering.
- Added admin dev/test command wiring:
  - `make dev-admin`
  - `make ui-test-admin`
  - `pnpm run test:ui:admin`
  - `scripts/start-admin-playwright.sh`

Phase 3 implementation continued (Sprint 3.5):

- Implemented approved-media publish-gating API in media module:
  - Added `GET /api/v1/media/public/:ownerUserId` (public endpoint) to list only moderation-`approved` assets for a member-facing user id (username or UUID input accepted).
  - Added short-lived signed download URL generation (`MEDIA_DOWNLOAD_URL_TTL_SECONDS`, default 300s) for approved assets.
  - Ensured response contract avoids internal storage metadata leakage (no bucket/object/checksum fields in public payload).
- Added API client support for public approved-media listing:
  - `web/src/lib/api.ts` -> `listPublicApprovedMedia(ownerUserId)`
  - `mobile/src/api.ts` -> `listPublicApprovedMedia(ownerUserId)`
- Wired user-facing profile preview flows:
  - Web profile page now includes "Public gallery preview" with member-ID lookup and approved-media list rendering.
  - Mobile profile page now includes the same approved-media preview flow with member-ID lookup.
- Added/extended unit coverage in `media.service.spec.ts`:
  - approved-only listing flow by member-facing user id
  - signed download URL presence
  - unknown member id rejection path
- Extended web Playwright profile-media flow to assert public-gallery empty-state behavior for newly uploaded (non-approved) media.

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

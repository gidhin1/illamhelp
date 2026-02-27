# Tasks and Milestones

## Delivery Approach

Use milestone-based execution with explicit exit criteria. Each milestone must pass security and quality gates before moving to the next.

## Current Calibration (As of 2026-02-27)

Legend:

- `Done`: implemented in code/docs and wired into runnable flows.
- `In Progress`: partially implemented, missing key behavior or coverage.
- `Pending`: not implemented yet.
- `Unknown`: cannot be verified from repository state alone.

### Milestone 0: Foundation

| Task | Status | Calibration Notes |
| --- | --- | --- |
| Set up mono-repo structure (`mobile`, `admin`, `api`, `infra`, `docs`) | Done | Repository contains all core workspaces and shared packages. |
| Configure CI pipeline (lint, typecheck, unit tests, SAST, secret scan) | Done | GitHub Actions workflow includes quality + gitleaks + trivy + semgrep jobs. |
| Provision base infrastructure with OpenTofu | Pending | No OpenTofu/Terraform files present under `infra/`. |
| Deploy PostgreSQL, Redis, MinIO, Keycloak, and observability stack | In Progress | Core runtime services are in Docker Compose; observability stack is not present yet. |
| Define RBAC matrix for all user roles | In Progress | Roles exist in code/docs, but no explicit role-permission matrix document. |
| Create API versioning and error contract standards | In Progress | Global prefix (`/api/v1`) exists; explicit formal error contract standard is not finalized. |
| Define data-classification matrix (`public`, `masked`, `consent_required`, `never_share`) | Done | Defined in policy/rules docs. |

Foundation Exit Criteria:

| Exit Criterion | Status | Calibration Notes |
| --- | --- | --- |
| Main branch protected with required checks | Unknown | Repository does not expose branch protection settings. |
| Staging environment reproducibly deployable | Pending | Local-first setup exists; no staging IaC/deploy pipeline in repo. |
| Security scan passes with no critical findings | Unknown | Scan jobs exist; latest results are not verifiable from local repo state. |

### Milestone 1: Identity + Profiles + Catalog

| Task | Status | Calibration Notes |
| --- | --- | --- |
| Implement auth flows (signup/login/refresh/logout) | In Progress | Signup + login + `/auth/me` implemented; refresh/logout endpoints are not implemented. |
| Add MFA and password policy for privileged roles | Pending | Not implemented in API/runtime policy. |
| Implement seeker/provider profile management | In Progress | `GET/PATCH /profiles/me` and `GET /profiles/:userId` with web/mobile profile edit screens are implemented; provider verification and richer profile workflows are pending. |
| Add provider verification document upload flow | Pending | Not implemented. |
| Build service category management and admin moderation | Pending | Not implemented; admin app is still placeholder. |
| Implement audit logging for profile/auth actions | In Progress | Consent/audit events exist; auth/profile-specific audit trails are incomplete. |
| Build media upload endpoints and signed URL flow to `quarantine` bucket | In Progress | `POST /media/upload-ticket`, `POST /media/:mediaId/complete`, and `GET /media` are implemented with signed MinIO URL generation and quarantine object keys; moderation workers are still pending. |
| Implement media metadata validation (type/size/duration/codec) | In Progress | Strict validation for kind/content-type/file-size/checksum/extension is implemented at upload-ticket creation; duration/codec validation still requires async media worker processing. |
| Build relationship endpoints (`request`, `accept`, `decline`, `block`) | Done | All four endpoints are implemented and wired to web/mobile actions. |
| Build PII consent endpoints (`request_access`, `grant`, `revoke`) | Done | Endpoints implemented with DB persistence and audit writes. |
| Build response filtering middleware for consent-aware field masking | In Progress | Consent read check (`can-view`) is implemented; generic response masking middleware is not. |

Milestone 1 Exit Criteria:

| Exit Criterion | Status | Calibration Notes |
| --- | --- | --- |
| Verified provider onboarding works end-to-end | Pending | Profile/verification flow incomplete. |
| Admin can approve/reject provider verification | Pending | Admin moderation UI not built. |
| Auth and profile APIs have integration tests | In Progress | Auth tests exist; profile API is implemented but requires dedicated API integration coverage. |
| Upload API blocks invalid media and logs decision reasons | In Progress | Upload ticket API now blocks invalid metadata and emits audit events; full moderation reason-code pipeline is still pending. |
| PII remains masked until mutual approval and owner grant are completed | In Progress | Consent model enforces this in consent path; full cross-endpoint field masking is pending. |

### Milestone 2: Jobs + Matching + Booking

| Task | Status | Calibration Notes |
| --- | --- | --- |
| Job posting APIs and mobile UI | Done | `GET/POST /jobs` and web/mobile job creation UIs are present. |
| Search and filtering with OpenSearch (category, geo, rating) | Pending | OpenSearch service exists in Compose, but no API integration yet. |
| Application and acceptance workflow | Pending | No job application APIs/workflow yet. |
| Booking lifecycle state machine | Pending | No booking module/state machine implementation yet. |
| Push/email notifications for state transitions | Pending | Not implemented. |
| Rate-limits and anti-spam controls on posting and messaging | Pending | No active API rate-limiting/messaging controls found. |
| Implement media processing workers (FFmpeg, ClamAV, EXIF stripping) | Pending | ClamAV container exists; workers and pipelines not implemented. |
| Implement AI moderation scoring pipeline and policy reason codes | Pending | Not implemented. |
| Build human moderation console and mandatory review queue | Pending | Not implemented (admin workspace placeholder only). |
| Publish-gating logic: only `approved` media visible/downloadable | In Progress | Data model/policy docs exist; public media APIs are not implemented. |
| Add real-time revocation propagation and cache invalidation for PII grants | Pending | Not implemented. |
| Add consent timelines to admin/support audit console | Pending | Not implemented. |

Milestone 2 Exit Criteria:

| Exit Criterion | Status | Calibration Notes |
| --- | --- | --- |
| Seeker can post and complete a booking with a provider | In Progress | Job post exists; booking completion flow not implemented. |
| Search latency and API latency meet target in staging load test | Pending | No load-test/staging benchmarks in repo. |
| Abuse controls verified with test cases | Pending | No anti-abuse test suite found. |
| No unreviewed media appears in any public endpoint | In Progress | No public media endpoints exist yet. |
| Revoked PII is no longer retrievable in all public/internal read APIs | In Progress | Consent revoke works for consent-check path; global read path coverage pending. |

### Milestone 3: Trust, Payments, Reviews

Status: all tasks and exit criteria are `Pending`.

### Milestone 4: Hardening + Launch Readiness

Status: all tasks and exit criteria are `Pending` (except baseline CI/security automation setup from Milestone 0).

### Test and Automation Calibration

| Area | Status | Calibration Notes |
| --- | --- | --- |
| Bruno API E2E | In Progress | Automated script covers auth/jobs/connections/consent/media and now validates consent-aware profile visibility before grant, after grant, and after revoke. |
| Web UI E2E (Playwright) | In Progress | Full-flow spec now covers human-centric people search + connect, consent-aware profile visibility checks, and block action; profile/media web flow has dedicated automation coverage. |
| Mobile UI E2E (Detox) | In Progress | Native Detox pipeline exists for iOS/Android, but stability is currently a blocker. |

### Security/Quality Gaps to Address Next

- Media moderation execution pipeline (scan/AI/human workers) is not implemented yet.
- Provider verification workflow remains unimplemented.
- Consent-aware masking middleware is still endpoint-specific, not global.
- OpenTofu/IaC staging path is not yet implemented.

## Next Plan (Proposed for Confirmation)

### Phase 1 (Stabilize Current MVP Slice)

- Fix Detox flow reliability end-to-end (auth -> jobs -> connections -> consent), including job-post crash/no-response path.
- Align Playwright full-flow selectors/assertions with current web UI to remove false negatives.
- Add startup preflight checks for missing critical env/runtime dependencies and fail fast with actionable messages.
- Sanitize `.env.example` to remove non-empty credentials.

### Phase 2 (Complete Milestone 1 Core Gaps)

- Implement profile CRUD APIs and web/mobile profile screens.
- Implement `connections/decline` and `connections/block`.
- Redesign the Privacy experience end-to-end with human-friendly language and guided actions (remove technical/internal wording from public flows).
- Add consent-aware response filtering for profile/contact fields across read endpoints.
- Add media upload signed URL endpoint to quarantine + metadata validation + audit events.

Phase 2 Status (2026-02-27): `Completed for the MVP slice above`.
Remaining Milestone 1 gaps are provider verification/admin moderation and full auth refresh/logout/MFA scope, which were not part of this Phase 2 slice.

### Phase 3 (Start Milestone 2 Core Backend)

- Implement job applications + acceptance workflow.
- Add search layer integration (OpenSearch indexing/query).
- Introduce baseline rate-limits/anti-abuse on auth, jobs, connections, and consent endpoints.

## Milestone 0: Foundation (Weeks 1-2)

### Tasks

- Set up mono-repo structure (`mobile`, `admin`, `api`, `infra`, `docs`)
- Configure CI pipeline (lint, typecheck, unit tests, SAST, secret scan)
- Provision base infrastructure with OpenTofu
- Deploy PostgreSQL, Redis, MinIO, Keycloak, and observability stack
- Define RBAC matrix for all user roles
- Create API versioning and error contract standards
- Define data-classification matrix (`public`, `masked`, `consent_required`, `never_share`)

### Exit Criteria

- Main branch protected with required checks
- Staging environment reproducibly deployable
- Security scan passes with no critical findings

## Milestone 1: Identity + Profiles + Catalog (Weeks 3-5)

### Tasks

- Implement auth flows (signup/login/refresh/logout)
- Add MFA and password policy for privileged roles
- Implement seeker/provider profile management
- Add provider verification document upload flow
- Build service category management and admin moderation
- Implement audit logging for profile/auth actions
- Build media upload endpoints and signed URL flow to `quarantine` bucket
- Implement media metadata validation (type/size/duration/codec)
- Build relationship endpoints (`request`, `accept`, `decline`, `block`)
- Build PII consent endpoints (`request_access`, `grant`, `revoke`)
- Build response filtering middleware for consent-aware field masking

### Exit Criteria

- Verified provider onboarding works end-to-end
- Admin can approve/reject provider verification
- Auth and profile APIs have integration tests
- Upload API blocks invalid media and logs decision reasons
- PII remains masked until mutual approval and owner grant are completed

## Milestone 2: Jobs + Matching + Booking (Weeks 6-9)

### Tasks

- Job posting APIs and mobile UI
- Search and filtering with OpenSearch (category, geo, rating)
- Application and acceptance workflow
- Booking lifecycle state machine
- Push/email notifications for state transitions
- Rate-limits and anti-spam controls on posting and messaging
- Implement media processing workers (FFmpeg, ClamAV, EXIF stripping)
- Implement AI moderation scoring pipeline and policy reason codes
- Build human moderation console and mandatory review queue
- Publish-gating logic: only `approved` media visible/downloadable
- Add real-time revocation propagation and cache invalidation for PII grants
- Add consent timelines to admin/support audit console

### Exit Criteria

- Seeker can post and complete a booking with a provider
- Search latency and API latency meet target in staging load test
- Abuse controls verified with test cases
- No unreviewed media appears in any public endpoint
- Revoked PII is no longer retrievable in all public/internal read APIs

## Milestone 3: Trust, Payments, Reviews (Weeks 10-12)

### Tasks

- Ratings/reviews with anti-fraud checks
- Dispute workflow and admin adjudication tools
- Payment gateway adapter and transaction ledger boundaries
- Payout scheduling hooks (if payments enabled)
- Content publishing module for safety and platform announcements
- Build media appeal flow (re-review request with moderator notes)
- Add moderation analytics (approval rate, false positives, SLA breaches)
- Add consent analytics (grant/revoke ratio, suspicious access patterns)

### Exit Criteria

- Review/dispute loop functional with audit trail
- Payment adapter tested in sandbox mode
- Security review completed on payment and moderation modules
- Media moderation SLA and audit reports available in admin dashboard
- Consent grant/revoke/read audit reports available for compliance review

## Milestone 4: Hardening + Launch Readiness (Weeks 13-14)

### Tasks

- Pen-test remediation and dependency hardening
- Backup and restore drill
- SLO dashboard and on-call runbook finalization
- Blue/green deployment rehearsal
- Release checklist and rollback playbook

### Exit Criteria

- No unresolved critical/high security findings
- RTO/RPO drill meets objectives
- Launch checklist signed off by engineering and product

## Continuous Backlog (Always On)

- Performance optimization for search ranking quality
- Fraud detection improvements
- Accessibility and localization enhancements
- Cost optimization and infrastructure right-sizing
- UX improvements from user research and support insights

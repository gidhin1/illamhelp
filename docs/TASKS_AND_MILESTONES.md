# Tasks and Milestones

## Delivery Approach

Use milestone-based execution with explicit exit criteria. Each milestone must pass security and quality gates before moving to the next.

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

# Project Rules

## 1) Product Rules

- A provider cannot accept jobs until identity and required documents are verified.
- A seeker can only review a provider after a completed booking.
- Every booking state change must create an immutable audit event.
- Admin moderation actions must include actor ID, reason, and timestamp.
- Platform content must be reviewed by admin before publishing.
- Image/video uploads are allowed only for service-relevant professional content.
- Media is publicly visible only after both AI review and human review approval.
- PII/contact information must stay masked by default between users.
- Mutual acquaintance approval is mandatory before PII consent requests.
- Only data owner can grant or revoke access to their PII/contact details.

## 2) Security Rules (Mandatory)

- Enforce least privilege for all services and users.
- Use OIDC/OAuth2 through Keycloak; do not build custom auth.
- MFA is mandatory for admin/support roles.
- Encrypt data in transit (`TLS 1.3`) and at rest.
- Store secrets outside code; use encrypted secret workflows (`SOPS + age`).
- Run SAST, secret scanning, dependency scanning, and container scanning on every PR.
- Block merges on critical/high vulnerabilities unless formal exception is approved.
- Keep full audit logs for auth, payments, profile verification, moderation, and role changes.
- Enforce malware scan and metadata sanitization on all uploaded media files.
- Deny direct public object storage access; allow only signed URL delivery.
- Encrypt sensitive PII fields at rest with managed key rotation.
- Enforce consent checks server-side; client-side checks alone are invalid.

## 3) Engineering Rules

- Language baseline: TypeScript strict mode for mobile/web/api.
- API contracts are backward compatible within a major version.
- All external integrations use adapter interfaces (no vendor lock in core domain).
- New modules require:
  - Unit tests
  - Integration tests for persistence and auth
  - API contract tests (for public endpoints)
- Definition of Done requires:
  - Code review approved
  - CI green
  - Security gates passed
  - Docs updated

## 4) Data and Privacy Rules

- Collect only minimum required PII.
- Sensitive documents must use private object storage access only (signed URLs).
- Retention policy must be defined per data class (profile docs, chats, logs, payments).
- Users must be able to request account deletion/anonymization according to legal policy.
- Strip geolocation and unnecessary EXIF metadata from all public media outputs.
- PII data classes:
  - `public`: safe profile fields
  - `masked`: partially hidden identity/contact fields
  - `consent_required`: full phone/email/address and similar sensitive fields
  - `never_share`: KYC/government documents, internal risk notes
- `never_share` data is never visible to other end users under any condition.
- Consent grants must be field-scoped, owner-scoped, and time-bounded where required.
- Revocation must remove access immediately across APIs, caches, and generated responses.

## 5) Reliability Rules

- Error budgets tied to SLOs for API and search.
- All critical jobs must be idempotent and retry-safe.
- Backups must be automated and restore-tested on schedule.
- Incident severity model (`SEV-1` to `SEV-4`) and response playbooks are required.

## 6) Branching and Release Rules

- `main` is always deployable.
- Short-lived feature branches and pull requests only.
- Protected branches require:
  - Passing checks
  - At least one reviewer approval
  - No unresolved security alerts
- Use semantic versioning and release notes for each production deployment.

## 7) Compliance and Trust Rules

- Track consent and policy acceptance events.
- Keep moderation evidence and dispute logs for defined retention windows.
- Periodically review abuse/fraud rules and update detection thresholds.
- Restrict privileged admin actions with explicit RBAC scopes.

## 8) Media Moderation Rules (Mandatory)

- All images/videos must enter `quarantine` state on upload.
- AI moderation must run on every media item with versioned model metadata.
- Human moderation must review every media item, even when AI marks as safe.
- Approved media moves to `approved` state and becomes publicly retrievable.
- Rejected media remains private and includes standardized rejection reason codes.
- Public endpoints must filter out all non-approved media states.
- Download access must be signed, short-lived, and rate-limited.
- All moderation actions must be auditable and immutable.

## 9) PII Sharing Rules (Mandatory)

- PII/contact sharing requires two-step approval:
  - Step 1: mutual acquaintance approval between both users
  - Step 2: explicit owner consent for requested data types
- Access to shared PII must be least-privilege and minimal by default.
- All PII access must be tied to business context (active booking, dispute, or approved connection).
- Owner can revoke consent at any time without counterparty approval.
- Every grant, view, and revoke action must include actor ID, target ID, purpose, and timestamp.

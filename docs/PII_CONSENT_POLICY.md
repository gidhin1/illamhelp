# PII Consent and Contact Sharing Policy

## Purpose

Protect user privacy by ensuring PII/contact data is shared only through explicit, revocable owner consent.

## Scope

Applies to all seeker-provider and provider-seeker interactions on IllamHelp.

## Default Privacy Posture

- PII/contact is hidden by default.
- Public profile data is limited to non-sensitive fields.
- Sensitive data access requires policy checks on every read.

## Two-Step Sharing Requirement (Mandatory)

1. Mutual Acquaintance Approval
   - User A sends acquaintance request to User B.
   - User B accepts request.
   - Only then can PII access be requested.
2. Owner Consent Approval
   - Requester selects needed PII types.
   - Data owner approves or rejects requested types.
   - Only approved types become visible.

## Data Types and Visibility

- `public`: first name, service categories, rating summary, city/area
- `masked`: partially hidden phone/email (example `98XXXXXX12`)
- `consent_required`: full phone, alternate phone, email, full address
- `never_share`: KYC documents, government IDs, internal moderation/risk notes

## Consent Grant Model

- Consent must be:
  - Field-scoped (specific data types)
  - Counterparty-scoped (specific user only)
  - Context-aware (job/booking/dispute reference when applicable)
  - Time-bounded when configured
- The system must store reason/purpose for each grant.

## Revocation Model

- Owner can revoke at any time.
- Revocation takes effect immediately:
  - API responses stop returning revoked fields
  - Cached views are invalidated
  - Existing signed links for sensitive artifacts are invalidated
- Revocation does not require other party approval.

## Access Controls

- All PII reads must pass server-side policy evaluation.
- UI-only masking without backend enforcement is not allowed.
- Block bulk export of end-user PII unless explicitly authorized for compliance/legal operations.
- Rate-limit high-frequency profile lookups to reduce scraping risk.

## Audit Requirements

Log immutable events for:

- Acquaintance request/accept/decline/block
- PII access request
- PII grant/reject
- PII read
- PII revoke

Each event must include actor ID, target ID, data types, purpose, and timestamp.

## Abuse and Safety Controls

- Trigger alerts for unusual PII access patterns.
- Auto-suspend repeated suspicious access attempts.
- Support can view audit trails but cannot bypass owner consent without break-glass workflow.

## Break-Glass Exception

- Allowed only for legal obligation, fraud investigation, or user safety emergency.
- Requires dual authorization and mandatory incident ticket linkage.
- Every break-glass action must be reviewed post-incident.

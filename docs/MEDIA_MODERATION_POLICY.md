# Media Moderation Policy

## Purpose

Define strict controls for image/video uploads so IllamHelp shows only professional, service-related media to the public.

## Scope

Applies to:

- Provider portfolio media
- Job-related proof media
- Service completion evidence
- Any user-generated image/video displayed in public or shared views

## Policy Principles

- Media must be relevant to domestic work/services.
- Media must be professional and safe.
- Every upload must pass both AI and human moderation.
- No unreviewed media can be publicly displayed or downloaded.

## Allowed Content

- Work photos/videos showing household service execution
- Tools, equipment, and before/after service outcomes
- Professional profile visuals with clear service relevance

## Prohibited Content

- Sexual/explicit material
- Violence, abuse, hate, or harassment
- Political/religious propaganda unrelated to service
- Personal entertainment clips unrelated to work
- Contact-spam overlays (phone/email/social links to bypass platform)
- Illegal or unsafe activity demonstrations

## Moderation Workflow (Mandatory Dual Review)

1. Upload: Client uploads via signed URL to `quarantine` bucket.
2. Technical validation: MIME type, extension, size, duration, resolution, codec, checksum.
3. Security sanitization: antivirus scan and metadata stripping.
4. AI moderation:
   - Professional relevance scoring
   - NSFW/adult screening
   - Violence/unsafe scene detection
   - OCR text extraction for spam/contact leakage
5. Human moderation:
   - Review every item regardless of AI result
   - Approve or reject with mandatory reason code
6. Publish gate:
   - Only `approved` media moves to `approved` bucket and public feeds
   - All other states remain non-public

## Media States

- `uploaded`
- `scanning`
- `ai_reviewed`
- `human_review_pending`
- `approved`
- `rejected`
- `appeal_pending`
- `appeal_resolved`

## Download Policy

- Download links issued only for `approved` media.
- Links must be signed and short-lived.
- Enforce rate limits per user/IP/device.
- Log every download event for audit.

## SLA and Operations

- Standard moderation SLA target: `< 30 minutes` P95
- Escalation queue for high-risk media
- Daily moderation quality audit with random sampling
- Weekly AI threshold tuning with moderator feedback

## Audit and Compliance

- Store immutable logs for:
  - AI model version and scores
  - Human reviewer decision
  - Rejection reason codes
  - Appeal outcomes
- Retain moderation evidence according to data-retention policy.

## Appeals

- Users may request one appeal per rejected media item.
- Appeal must be reviewed by a different moderator.
- Appeal decision is final and auditable.

# IllamHelp Codebase Audit Report

**Audit Date**: 2026-03-01
**Scope**: Full codebase review — all API modules, frontends, tests, infrastructure, and documentation

---

## Part 1: Business Flows Implemented (Baseline)

### 1. Authentication (`auth`)
| Flow | Status | Endpoints |
|---|---|---|
| User registration (username/email/password) | ✅ Done | `POST /auth/register` |
| User login | ✅ Done | `POST /auth/login` |
| Current user info | ✅ Done | `GET /auth/me` |
| Token refresh | ❌ Not implemented | — |
| Logout / session invalidation | ❌ Not implemented | — |
| MFA for privileged roles | ❌ Not implemented | — |
| Password policy (uppercase + lowercase + digit) | ✅ Done | DTO validation |

### 2. Profiles (`profiles`)
| Flow | Status | Endpoints |
|---|---|---|
| Profile bootstrap on registration | ✅ Done | Internal |
| Get own profile (full PII) | ✅ Done | `GET /profiles/me` |
| Update own profile | ✅ Done | `PATCH /profiles/me` |
| View another user's profile (consent-aware) | ✅ Done | `GET /profiles/:userId` |
| PII encryption at rest (AES-256-GCM) | ✅ Done | Internal |
| Consent-aware field masking | ✅ Done | Per-field consent check |
| Provider verification flow | ❌ Not implemented | — |

### 3. Jobs + Applications + Booking (`jobs`)
| Flow | Status | Endpoints |
|---|---|---|
| Create job | ✅ Done | `POST /jobs` |
| List jobs | ✅ Done | `GET /jobs` |
| Search jobs (text/category/geo/rating) | ✅ Done | `GET /jobs/search` |
| Apply for job | ✅ Done | `POST /jobs/:id/apply` |
| List job applications (owner / self) | ✅ Done | `GET /jobs/:id/applications`, `GET /jobs/applications/mine` |
| Accept application | ✅ Done | `POST /jobs/applications/:id/accept` |
| Reject application | ✅ Done | `POST /jobs/applications/:id/reject` |
| Withdraw application | ✅ Done | `POST /jobs/applications/:id/withdraw` |
| Start booking (provider) | ✅ Done | `POST /jobs/:id/booking/start` |
| Complete booking (seeker) | ✅ Done | `POST /jobs/:id/booking/complete` |
| Cancel booking (seeker or provider) | ✅ Done | `POST /jobs/:id/booking/cancel` |
| OpenSearch integration with DB fallback | ✅ Done | Internal |
| Geo-based search (Haversine formula) | ✅ Done | Internal |

### 4. Connections (`connections`)
| Flow | Status | Endpoints |
|---|---|---|
| Request connection | ✅ Done | `POST /connections/request` |
| Accept connection | ✅ Done | `POST /connections/:id/accept` |
| Decline connection | ✅ Done | `POST /connections/:id/decline` |
| Block connection | ✅ Done | `POST /connections/:id/block` |
| List connections | ✅ Done | `GET /connections` |
| Search people (multi-signal fuzzy match) | ✅ Done | `GET /connections/search` |
| Re-open declined connection | ✅ Done | Auto on re-request |

### 5. PII Consent management (`consent`)
| Flow | Status | Endpoints |
|---|---|---|
| Request PII access | ✅ Done | `POST /consent/request-access` |
| Grant PII access (field-scoped) | ✅ Done | `POST /consent/:requestId/grant` |
| Revoke PII access | ✅ Done | `POST /consent/:grantId/revoke` |
| Check field visibility (OPA-backed) | ✅ Done | `POST /consent/can-view` |
| List access requests | ✅ Done | `GET /consent/requests` |
| List grants | ✅ Done | `GET /consent/grants` |
| Real-time revocation propagation | ❌ Not implemented | — |

### 6. Media upload + lifecycle (`media`)
| Flow | Status | Endpoints |
|---|---|---|
| Create upload ticket (signed URL) | ✅ Done | `POST /media/upload-ticket` |
| Complete upload (HEAD verification) | ✅ Done | `POST /media/:mediaId/complete` |
| List own media | ✅ Done | `GET /media` |
| List public approved media (signed download URLs) | ✅ Done | `GET /media/public/:ownerUserId` |
| Metadata validation (type/size/checksum/extension) | ✅ Done | Internal |
| Protobuf internal event emission | ✅ Done | Internal outbox |

### 7. Media moderation (`media-moderation`)
| Flow | Status | Endpoints |
|---|---|---|
| Technical validation (content type + size) | ✅ Done | Internal worker |
| AI moderation scoring (heuristic baseline) | ✅ Done | Internal worker |
| Human review queue | ✅ Done | `GET /admin/media/queue` |
| Human review detail | ✅ Done | `GET /admin/media/:mediaId/details` |
| Approve / reject media | ✅ Done | `POST /admin/media/:mediaId/review` |
| Batch process pending jobs | ✅ Done | `POST /admin/media/process` |
| Publish gating (approved-only public access) | ✅ Done | Internal |

### 8. Admin oversight
| Flow | Status | Endpoints |
|---|---|---|
| Member timeline (consent + audit) | ✅ Done | `GET /admin/oversight/timeline` |
| Admin/Support role gating | ✅ Done | `@Roles` guard |

### 9. Infrastructure + Cross-cutting
| Area | Status |
|---|---|
| Rate limiting (sliding-window, per-endpoint) | ✅ Done |
| Security headers (CSP, HSTS, X-Frame-Options, etc.) | ✅ Done |
| CORS with origin check | ✅ Done |
| Swagger / OpenAPI (dev mode) | ✅ Done |
| Audit event logging | ✅ Done |
| CI pipeline (lint, typecheck, SAST, secret scan) | ✅ Done |
| DB migrations (8 migrations) | ✅ Done |
| Keycloak JWT guard (global auth) | ✅ Done |
| Startup preflight checks | ✅ Done |

---

## Part 2: Bugs and Issues Found

### ✅ ~~BUG-001~~ — RECLASSIFIED: Working as intended
- **Status**: **Not a bug** — confirmed by business owner
- **File**: [auth.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/auth/auth.service.ts#L197-L206), [keycloak-jwt.guard.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/auth/guards/keycloak-jwt.guard.ts#L159-L168)
- **Business rule**: All regular users have role `both`. Seeker/provider distinction is **contextual per-job** — the job creator is the seeker (`seeker_user_id`), the accepted applicant is the provider (`assigned_provider_user_id`). This is already correctly implemented in `jobs.service.ts`.
- **Code note**: The dead branches in `userTypeFromRoles()` and `resolveUserType()` could be cleaned up to remove the unreachable if/else for readability, but this is cosmetic only.

---

### ✅ ~~BUG-002~~ — RECLASSIFIED: Working as intended
- **Status**: **Not a bug** — confirmed by business owner
- **File**: [auth.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/auth/auth.service.ts#L669-L680), [keycloak-jwt.guard.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/auth/guards/keycloak-jwt.guard.ts#L146-L157)
- **Business rule**: All non-admin/support users are normalized to `["both"]` by design. The platform intentionally treats every regular member as capable of both seeking and providing services.

---

### 🔴 BUG-003: SQL injection risk in `searchInDatabase()` via ILIKE patterns
- **Severity**: High (Security)
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L744-L746)
- **Description**: User-supplied search terms are concatenated into ILIKE patterns without escaping SQL wildcard characters (`%`, `_`, `\`). A user can inject `%` or `_` to bypass intended search behavior.
  ```typescript
  const searchPattern = input.q ? `%${input.q}%` : null;
  const categoryPattern = input.category ? `%${input.category}%` : null;
  const locationPattern = input.locationText ? `%${input.locationText}%` : null;
  ```
- **Impact**: Users can craft search queries that match unintended records using SQL wildcards. While parameterized queries prevent full SQL injection, wildcard injection can leak data that should not match.
- **Same pattern in**: [connections.service.ts:L254](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts#L254) — `searchCandidates()` has the same issue.
- **Suggested Fix**: Escape `%`, `_`, and `\` in user input before wrapping in ILIKE patterns.

---

### 🔴 BUG-004: `accept()` in ConnectionsService does not verify requester cannot accept their own request
- **Severity**: Medium
- **File**: [connections.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts#L140-L186)
- **Description**: The `accept()` method checks that the actor is a participant, but does **not** verify that the actor is **not** the original requester. The original requester can accept their own connection request.
- **Impact**: Self-accept bypass — a user can send a connection request and immediately accept it themselves, skipping the other party's consent.
- **Suggested Fix**: Add check: `if (connection.requested_by_user_id === actorUserId) throw new BadRequestException("Cannot accept your own connection request")`.

---

### 🔴 BUG-005: Race condition in `acceptApplication()` — non-atomic multi-step operation
- **Severity**: Medium
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L336-L406)
- **Description**: `acceptApplication()` performs 3 separate SQL queries (update application status, reject other applications, update job status) without a transaction. A concurrent accept on a different application for the same job could result in:
  - Two applications being accepted for the same job
  - One application rejected despite being accepted
  - The job `assigned_provider_user_id` referencing the wrong application
- **Impact**: Data inconsistency in the most critical job assignment flow.
- **Suggested Fix**: Wrap all three queries in a database transaction (or use a single atomic SQL statement with `SELECT ... FOR UPDATE`).

---

### 🔴 BUG-006: `cancelBooking()` — non-atomic multi-step operation
- **Severity**: Medium
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L601-L682)
- **Description**: `cancelBooking()` updates the jobs table and then separately updates the application status, without a transaction. The job could be cancelled but the application left in `accepted` state.
- **Suggested Fix**: Same as BUG-005 — wrap in a transaction.

---

### 🟡 BUG-007: `consent.service.ts` — `resolveInternalUserId()` doesn't verify UUID user existence
- **Severity**: Medium
- **File**: [consent.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/consent/consent.service.ts#L579-L602)
- **Description**: When the input looks like a UUID, `resolveInternalUserId()` returns it directly without checking if the user actually exists in the `users` table. This allows operations against non-existent user IDs which will silently pass validation but produce orphaned records.
- **Same issue in**: [profiles.service.ts:L375-L400](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/profiles/profiles.service.ts#L375-L400) and [media.service.ts:L736-L761](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media.service.ts#L736-L761).
- **Not an issue in**: `connections.service.ts` which correctly calls `assertInternalUserExists()` for UUID inputs.
- **Suggested Fix**: Add a DB existence check when a UUID is provided, matching the pattern used in `connections.service.ts`.

---

### 🟡 BUG-008: `completeUpload()` — state check allows `scanning` → `scanning` no-op transition
- **Severity**: Low  
- **File**: [media.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media.service.ts#L456)
- **Description**: `completeUpload()` accepts state `uploaded` **or** `scanning` and then unconditionally transitions to `scanning`. When called on an asset already in `scanning` state, this is a redundant no-op that re-runs HEAD verification and emits duplicate audit/internal events.
- **Impact**: Duplicate audit events and potential confusion in event processing downstream.
- **Suggested Fix**: Either reject completion when already in `scanning` state, or add idempotency guard to skip duplicate event emission.

---

### 🟡 BUG-009: `processTechnicalValidationJob()` missing `actorUserId` in audit event  
- **Severity**: Low
- **File**: [media-moderation.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media-moderation.service.ts#L593-L601)
- **Description**: Technical validation rejection audit events omit the `actorUserId` field. The `logEvent` call only sets `targetUserId` but not `actorUserId`, which makes audit timeline filtering by actor incomplete.
- **Same issue at**: [line 660-667](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media-moderation.service.ts#L660-L667) — `media_technical_validation_passed` audit also missing `actorUserId`.
- **Suggested Fix**: Pass the system/batch actor user ID or a sentinel like `"system"`.

---

### 🟡 BUG-010: `list()` in JobsService has no pagination — returns all jobs
- **Severity**: Medium (Performance)
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L191-L214)
- **Description**: `GET /api/v1/jobs` has no `LIMIT` clause and no pagination. As the database grows, this endpoint will return increasingly large payloads, degrading performance and risking OOM on the server.
- **Impact**: Eventually causes slow responses and memory pressure. Also exposes all jobs without any cursor/offset mechanism.
- **Suggested Fix**: Add default limit (e.g., 50), pagination parameters (`offset`/`cursor`), and apply `clampLimit()`.

---

### 🟡 BUG-011: `list()` in ConnectionsService has no pagination — returns all connections  
- **Severity**: Medium (Performance)
- **File**: [connections.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts#L365-L386)
- **Description**: Same as BUG-010 — `GET /api/v1/connections` returns all connections for a user without any `LIMIT`.
- **Suggested Fix**: Add pagination (limit + offset or cursor).

---

### 🟡 BUG-012: `consent.service.ts` does not check for expired grants in `canView()`
- **Severity**: High (Security)
- **File**: [consent.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/consent/consent.service.ts#L356-L423)
- **Description**: The SQL query in `canView()` selects grants with status `active` but does **not** filter out expired grants (where `expires_at < now()`). Expired grants will still be treated as valid. The OPA policy *may* catch this if the `expires_at` is passed to it, but the code only passes `expires_at` to OPA when it's non-null — it doesn't explicitly check expiration.
- **Impact**: A user whose grant has expired might still see PII data if the OPA policy doesn't independently enforce expiration (defense-in-depth gap).
- **Suggested Fix**: Add `AND (g.expires_at IS NULL OR g.expires_at > now())` to the SQL WHERE clause.

---

### 🟡 BUG-013: `consent.service.ts` — no duplicate grant prevention
- **Severity**: Medium
- **File**: [consent.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/consent/consent.service.ts#L199-L288)
- **Description**: The `grant()` method doesn't check if an active grant already exists for the same owner→grantee→connection combination. Calling grant multiple times creates duplicate active grants, which complicates revocation (revoking one grant doesn't revoke the other duplicates).
- **Impact**: PII access may survive revocation if duplicate grants exist.
- **Suggested Fix**: Either `UPSERT` or check for existing active grants before inserting.

---

### 🟡 BUG-014: Silent catch with empty body in `syncSearchIndex()`
- **Severity**: Low
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L877-L879)
- **Description**: Search index sync errors are silently swallowed with `catch {}`. No logging, no error reporting. If OpenSearch indexing consistently fails, the search results will become stale without any indication.
- **Suggested Fix**: At minimum log the error, or emit a metric/alert.

---

## Part 3: Test Coverage Gap Analysis

### Existing Unit/Integration Tests (18 spec files)

| Test File | Coverage Area |
|---|---|
| `auth.service.spec.ts` | Auth registration & login mocks |
| `keycloak-jwt.guard.spec.ts` | JWT verification & role extraction |
| `consent.service.spec.ts` | canView (2 tests: no grant / OPA delegation) |
| `consent.auth.integration.spec.ts` | HTTP-level consent endpoint auth |
| `connections.service.spec.ts` | Connection lifecycle |
| `jobs-search.service.spec.ts` | OpenSearch query shaping, fallback |
| `jobs.auth.integration.spec.ts` | Application/booking transition guards |
| `media.service.spec.ts` | Upload ticket, complete, approved listing |
| `media-moderation.service.spec.ts` | Moderation worker flow |
| `admin-media.auth.integration.spec.ts` | Admin media endpoint auth |
| `profiles.service.spec.ts` | Consent-aware field masking |
| `sliding-window-rate-limiter.spec.ts` | Rate limiter behavior |
| `internal-events.codec.spec.ts` | Protobuf round-trip |
| `health.controller.spec.ts` | Health endpoint |

### Gaps Requiring New Tests

| Bug ID | Recommended Test |
|---|---|
| ~~BUG-001~~ | ~~Reclassified — not a bug (role is always `both` by design)~~ |
| BUG-003 | Test SQL wildcard injection doesn't match unintended records |
| BUG-004 | Test that original requester cannot accept their own connection request |
| BUG-005 | Test concurrent application acceptance (may need integration test with real DB) |
| BUG-007 | Test consent operations against non-existent UUID user IDs |
| BUG-010 | Test that job list endpoint respects pagination limits |
| BUG-012 | Test that expired grants are not honored by `canView()` |
| BUG-013 | Test that duplicate active grants don't survive single revocation |

---

---

## Part 4: Performance Issues

### 🟡 PERF-001: Profile page fires 6 parallel API calls + 1 follow-up on every load
- **Severity**: Medium
- **File**: [profile/page.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/profile/page.tsx#L173-L192)
- **Description**: `loadProfileData()` fires `Promise.all` with `listJobs`, `listConnections`, `listConsentRequests`, `listConsentGrants`, `getMyProfile`, `listMyMedia` — then follows up with `loadPublicGallery()`. That's 7 HTTP requests on every page load, including unbounded list endpoints (BUG-010, BUG-011).
- **Impact**: Slow profile page load, especially on mobile networks. Server pressure scales linearly with active users.
- **Suggested Fix**: Add server-side aggregation endpoint (e.g. `GET /profiles/me/dashboard`) or lazy-load secondary data.

### 🟡 PERF-002: `sha256Hex()` blocks the main thread for large file uploads
- **Severity**: Medium
- **File**: [profile/page.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/profile/page.tsx#L95-L103)
- **Description**: `file.arrayBuffer()` loads the entire file into memory before hashing. For a 100MB video upload (max allowed), this blocks the main thread and may cause "page not responding" warnings.
- **Impact**: UI freezes during uploads of large files.
- **Suggested Fix**: Use a streaming/chunked approach or move to a Web Worker.

### 🟡 PERF-003: Database connection pool uses defaults — no tuning
- **Severity**: Medium
- **File**: [database.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/common/database/database.service.ts#L19)
- **Description**: `new Pool({ connectionString })` uses default `pg` pool settings (max 10 connections, no idle timeout, no connection timeout). Under moderate load, all connections may be exhausted.
- **Impact**: Connection starvation under concurrent requests; requests queue indefinitely with no timeout.
- **Suggested Fix**: Configure `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, and `statement_timeout`.

### 🟡 PERF-004: No API response compression
- **Severity**: Low
- **File**: [main.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/main.ts)
- **Description**: No `@fastify/compress` plugin registered. JSON responses (especially large job/connection lists) are sent uncompressed.
- **Impact**: Wasted bandwidth, slower load times on mobile networks.
- **Suggested Fix**: Add `@fastify/compress` to the Fastify instance.

### 🟡 PERF-005: Admin oversight `listAuditEvents` uses table alias `target_user_id` as JOIN name
- **Severity**: Low (Correctness/Performance)
- **File**: [admin-oversight.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/admin/admin-oversight.service.ts#L275)
- **Description**: The SQL aliases the target user join as `target_user_id` which is confusingly the same name as the column. While PostgreSQL resolves this, it makes the query fragile and error-prone for future modifications. The reference `target_user_id.username` on line 270 uses the table alias, not the column.
- **Impact**: Maintenance hazard; could break silently if columns are renamed.
- **Suggested Fix**: Rename the alias to `target_user` or `target`.

---

## Part 5: Availability Issues

### 🟡 AVAIL-001: Most docker-compose services lack healthchecks
- **Severity**: Medium
- **File**: [docker-compose.yml](file:///Users/gidhin1/Documents/claude_proj/illamhelp/infra/docker-compose.yml)
- **Description**: Only `postgres` has a healthcheck. Redis, MinIO, NATS, OpenSearch, Keycloak, OPA, and ClamAV all run without health monitoring. If any service hangs (instead of crashing), `restart: unless-stopped` won't help.
- **Impact**: Silent infrastructure failures; degraded availability without alerts.
- **Suggested Fix**: Add healthchecks for each service and use `depends_on` conditions.

### 🟡 AVAIL-002: No database connection retry/backoff on startup
- **Severity**: Medium
- **File**: [database.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/common/database/database.service.ts)
- **Description**: `DatabaseService` creates a pool immediately in the constructor. If the database isn't ready when the API starts (common in container orchestration), the pool will fail silently — queries against it will return connection errors until PostgreSQL is available, but there's no startup probe or retry.
- **Impact**: API may start accepting HTTP traffic before the database is actually reachable.
- **Suggested Fix**: Add a startup probe that verifies database connectivity before marking the app healthy.

### 🟡 AVAIL-003: No graceful shutdown handling beyond `pool.end()`
- **Severity**: Low
- **File**: [main.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/main.ts)
- **Description**: The API has `enableShutdownHooks()`, but there's no drain period for in-flight requests, no coordination with external health probes, and no SIGTERM handler that delays shutdown to allow load balancers to stop routing traffic.
- **Impact**: During deployments, in-flight requests may be terminated abruptly.
- **Suggested Fix**: Add graceful shutdown with drain timeout.

---

## Part 6: Accessibility Issues

### 🟡 A11Y-001: No skip navigation link
- **Severity**: Medium
- **Files**: [NavBar.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/components/NavBar.tsx), [layout.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/layout.tsx)
- **Description**: No "Skip to main content" link exists. Keyboard and screen reader users must tab through the entire nav bar on every page load.
- **Impact**: WCAG 2.1 AA violation (Success Criterion 2.4.1).
- **Suggested Fix**: Add a visually hidden skip link as the first focusable element in the layout.

### 🟡 A11Y-002: `NavBar` uses `<nav>` without `aria-label`
- **Severity**: Low
- **File**: [NavBar.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/components/NavBar.tsx#L27)
- **Description**: The `<nav>` element has no `aria-label`. With multiple landmarks on the page (nav, main, footer), screen readers can't distinguish them.
- **Suggested Fix**: Add `aria-label="Main navigation"`.

### 🟡 A11Y-003: Form inputs in web app have no `autocomplete` attributes
- **Severity**: Medium
- **Files**: [login/page.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/auth/login/page.tsx), [register/page.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/auth/register/page.tsx)
- **Description**: Login username/password fields and registration form fields do not set `autoComplete` props. Browsers and password managers cannot assist users, and this is a WCAG 1.3.5 (Input Purpose) violation.
- **Impact**: Poor UX with password managers; WCAG 2.1 AA non-compliance.
- **Suggested Fix**: Add `autoComplete="username"`, `autoComplete="current-password"`, `autoComplete="email"`, etc.

### 🟡 A11Y-004: `Banner` component has no `role` attribute for screen readers
- **Severity**: Medium
- **File**: [primitives.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/components/ui/primitives.tsx#L107-L115)
- **Description**: Error/success banners render as plain `<div>` elements without `role="alert"` (for errors) or `role="status"` (for success). Screen readers won't announce them when they dynamically appear.
- **Impact**: Blind/low-vision users may miss critical form feedback.
- **Suggested Fix**: Add `role="alert"` for error banners, `role="status"` for success/info banners.

### 🟡 A11Y-005: `Card` component semantics — `<section>` without heading
- **Severity**: Low
- **File**: [primitives.tsx](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/components/ui/primitives.tsx#L43)
- **Description**: `Card` renders as `<section>` but not all Cards receive a heading child. A `<section>` without a heading is an accessibility anti-pattern — screen readers list sections by heading in landmarks navigation.
- **Suggested Fix**: Use `<div>` instead of `<section>`, or ensure every Card has a heading.

### 🟡 A11Y-006: No visible focus indicator differentiation for interactive buttons inside `<Link>`
- **Severity**: Low
- **File**: [page.tsx (home)](file:///Users/gidhin1/Documents/claude_proj/illamhelp/web/src/app/page.tsx#L42-L48)
- **Description**: Buttons wrapped inside Next.js `<Link>` components create nested interactive elements. Keyboard focus behavior is ambiguous — the `<a>` and the `<button>` are both focusable, creating a confusing tab order.
- **Suggested Fix**: Use `Link` component with `role="button"` styling, or use `useRouter().push()` on button click.

### 🟡 A11Y-007: Loading states use plain text with no `aria-live` region
- **Severity**: Medium  
- **Files**: All pages (jobs, connections, consent, profile)
- **Description**: Loading indicators like `"Loading jobs..."` and `"Loading connections..."` appear as plain `<p>` text. Screen readers won't announce the loading state change because no `aria-live` region wraps them. When data appears after loading completes, this transition is also not announced.
- **Suggested Fix**: Wrap loading/empty-state areas in `aria-live="polite"` containers.

---

## Part 7: Summary Statistics

| Metric | Count |
|---|---|
| **Total API modules** | 8 (auth, jobs, connections, consent, media, profiles, admin, audit) |
| **Total API source files** | 83 |
| **Total test spec files** | 18 |
| **Frontend files** | 33 (web) + 13 (admin) + 9 (mobile) |
| **Business flows fully implemented** | 43 |
| **Business flows NOT implemented** | 7 (refresh, logout, MFA, verification, revocation propagation) |
| **Logic/Security bugs** | 12 active (2 reclassified as not-a-bug) |
| **Performance issues** | 5 |
| **Availability issues** | 3 |
| **Accessibility issues** | 7 |
| **Total active issues** | **27** |
| **DB migrations** | 8 |

---

> [!IMPORTANT]  
> **No changes have been made to the codebase.** This is a read-only audit report. All fixes require your approval before implementation.

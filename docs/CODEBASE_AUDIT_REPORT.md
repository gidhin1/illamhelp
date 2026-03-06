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
| Token refresh | ✅ Done | `POST /auth/refresh` |
| Logout / session invalidation | ✅ Done | `POST /auth/logout` |
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
| Provider verification flow | ✅ Done | `POST /profiles/me/verification`, `GET /profiles/me/verification`, admin review endpoints |

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

### ✅ ~~BUG-003~~ — FIXED
- **Status**: **Fixed** — `escapeIlikeLiteral()` utility now escapes `%`, `_`, and `\` in all ILIKE patterns across `jobs.service.ts` and `connections.service.ts`.
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts), [connections.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts)

---

### ✅ ~~BUG-004~~ — FIXED
- **Status**: **Fixed** — `accept()` now checks `requested_by_user_id === actorUserId` and throws `BadRequestException("Cannot accept your own connection request")`.
- **File**: [connections.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts#L170-L172)

---

### ✅ ~~BUG-005~~ — FIXED
- **Status**: **Fixed** — `acceptApplication()` now wraps all three queries in `this.databaseService.transaction()` with a `WHERE status = 'posted'` guard on the job update for conflict detection.
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L445-L490)

---

### ✅ ~~BUG-006~~ — FIXED
- **Status**: **Fixed** — `cancelBooking()` now wraps both job and application updates in `this.databaseService.transaction()`.
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L884-L928)

---

### ✅ ~~BUG-007~~ — FIXED (2026-03-05)
- **Status**: **Fixed** — `resolveInternalUserId()` in `profiles.service.ts` and `media.service.ts` now performs a DB existence check for UUID inputs, throwing `NotFoundException` for non-existent user IDs. `consent.service.ts` already had this check.
- **Files**: [profiles.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/profiles/profiles.service.ts#L476-L485), [media.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media.service.ts#L768-L777)

---

### ✅ ~~BUG-008~~ — FIXED
- **Status**: **Fixed** — `completeUpload()` now only accepts state `uploaded` and rejects with `BadRequestException` for any other state (including `scanning`).
- **File**: [media.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media.service.ts#L483)

---

### ✅ ~~BUG-009~~ — RECLASSIFIED: Working as designed
- **Status**: **Not a bug** — `actorUserId` is UUID-typed and validated by `assertUuid()` in `AuditService.logEvent()`. System-initiated actions (automated workers) correctly use `metadata.actor: "system"` instead, which is the intended pattern for non-human actors.
- **File**: [media-moderation.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/media/media-moderation.service.ts#L603-L612), [audit.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/audit/audit.service.ts#L19-L21)

---

### ✅ ~~BUG-010~~ — FIXED
- **Status**: **Fixed** — `list()` now supports `limit` (default 50, max 100) and `offset` parameters with `safeLimit`/`safeOffset` clamping, returns `{ items, total, limit, offset }` response shape.
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L207-L214)

---

### ✅ ~~BUG-011~~ — FIXED
- **Status**: **Fixed** — `list()` now supports `limit` (default 50, max 100) and `offset` with `{ items, total, limit, offset }` response shape.
- **File**: [connections.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/connections/connections.service.ts#L384-L422)

---

### ✅ ~~BUG-012~~ — FIXED
- **Status**: **Fixed** — `canView()` SQL now includes `AND (g.expires_at IS NULL OR g.expires_at > now())` filter to exclude expired grants at query level.
- **File**: [consent.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/consent/consent.service.ts#L422)

---

### ✅ ~~BUG-013~~ — FIXED
- **Status**: **Fixed** — `grant()` now checks for existing active grants (owner + grantee + connection + status `active` + non-expired) and throws `BadRequestException` if a duplicate exists.
- **File**: [consent.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/consent/consent.service.ts#L234-L251)

---

### ✅ ~~BUG-014~~ — FIXED
- **Status**: **Fixed** — `syncSearchIndex()` catch block now logs the error via `console.warn` with job ID and error message.
- **File**: [jobs.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/jobs/jobs.service.ts#L1174-L1180)

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

### ✅ ~~PERF-001~~ — RESOLVED
- **Status**: **Resolved** — Server-side dashboard aggregation endpoint `GET /profiles/me/dashboard` now exists, returning profile, metrics (jobs, connections, consent, media counts), and recent jobs in a single API call. List endpoints also now support pagination (BUG-010, BUG-011 fixed).
- **Files**: [profiles.service.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/profiles/profiles.service.ts#L159-L239), [profiles.controller.ts](file:///Users/gidhin1/Documents/claude_proj/illamhelp/api/src/modules/profiles/profiles.controller.ts#L17-L20)

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
| **Business flows fully implemented** | 45 (+refresh, +logout) |
| **Business flows NOT implemented** | 5 (MFA, verification, revocation propagation, password reset) |
| **Logic/Security bugs** | 0 active (12 fixed, 2 reclassified as not-a-bug) |
| **Performance issues** | 4 active (1 resolved: PERF-001) |
| **Availability issues** | 3 |
| **Accessibility issues** | 7 |
| **Total active issues** | **14** |
| **DB migrations** | 8 |

---

> [!NOTE]  
> **Last updated**: 2026-03-05. Bug fixes BUG-007 and BUG-009 applied in this sprint. All other bugs were fixed in prior sprints.

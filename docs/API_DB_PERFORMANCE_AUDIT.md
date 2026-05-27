# IllamHelp API and Database Layer Audit

Date: 2026-05-26

## Scope And Method

This review covers the current Spring Boot API under `api-java/src/main`, the PostgreSQL baseline at `infra/db/migrations/V0001__baseline.sql`, and the web/mobile/admin API-client contracts that constrain backend changes.

Skills applied: `senior-backend`, `senior-architect`, `senior-fullstack`, `sql-database-assistant`, `database-designer`, `performance-profiler`, and `code-reviewer`.

This began as a static code and schema review against the current working tree. The implemented remedies have since been covered by unit/type checks and disposable PostgreSQL schema/query smoke validation. Representative-volume `EXPLAIN (ANALYZE, BUFFERS)`, load, and concurrency measurements remain required before final tuning.

## Implementation Status - 2026-05-26

| Finding | Status | Implemented Change |
| --- | --- | --- |
| N+1 public identifiers | Fixed for collection paths | Jobs, job applications, connections, and consent list projections now join public identifiers in repository queries; services use projected identifiers without per-row lookup. |
| Consent grant race | Fixed | Grant approval/insertion is one conditional repository CTE and the schema enforces one active grant per owner/grantee/connection. |
| Lifecycle transition races | Fixed for audited paths | Job acceptance/status movement, connection decisions, media human review, upload completion, and verification review now require expected state before emitting side effects. |
| Unbounded consent/media reads | Fixed at API boundary | Consent and media routes now return bounded cursor envelopes ordered by `(created_at, id)`; web/mobile client adapters accept and unwrap the paged shape. Public media signs only rows returned in the page. |
| Job search SQL overhead | Improved | OpenSearch result ranking now passes a typed UUID-compatible array relation instead of reparsing comma text, and trigram indexes support fallback contains filters. |
| Connection search corpus scan | Fixed for current search contract | A trigger-maintained `connection_search_documents` projection stores searchable/facet content; the repository searches its GIN indexed text/vector fields rather than rebuilding job facets on each query. |
| External calls inside transactions | Fixed for job indexing and media completion | Job indexing runs after commit. Media signing and storage `HEAD` verification occur outside transactions; the resulting media state/audit/outbox mutation is committed in a short transactional service. |
| Audit independent commits | Fixed | Audit writes now join the caller transaction instead of always creating `REQUIRES_NEW` commits. |
| Rate-limit bucket memory | Fixed for configured deployments | Redis TTL-backed atomic increments now provide distributed throttling when enabled, with the bounded local store retained as a fail-open fallback for temporary Redis failure. |
| Offset pagination/count overhead | Fixed for feed routes | Consent, media, jobs, connections, notifications, and verification administration now use keyset cursor pages. Web, admin, and mobile screens expose load-more continuation; notification listing no longer repeats a total-count query. |
| Moderation batch contention | Fixed for automated processing | A scheduled worker atomically claims one queued item with `FOR UPDATE SKIP LOCKED`/`UPDATE ... RETURNING` and commits each processed item independently. The admin process action remains an explicit bounded trigger. |
| Supporting indexes | Fixed for identified bounded paths | Added media, moderation, verification, notification, assigned-job, consent-uniqueness, and job fallback-search indexes. |
| Missing-row mutation errors | Fixed for identified paths | Consent revoke and verification review return controlled API errors; conditional transitions reject stale changes. |

**Verification performed**

- `mvn clean test -q` passes after the changes, including Mockito coverage for stale-transition side-effect suppression, cursor responses, bounded presigning, transactional media mutation, Redis-backed rate-limit selection, and scheduled moderation dispatch.
- `corepack pnpm --filter @illamhelp/web typecheck`, `corepack pnpm --filter @illamhelp/admin typecheck`, and `corepack pnpm --filter @illamhelp/mobile typecheck` pass after cursor continuation controls were added.
- Applied `V0001__baseline.sql` successfully to an isolated disposable `postgres:18-alpine` database.
- Executed native SQL checks in disposable PostgreSQL: competing job acceptance and duplicate active grant returned zero changed rows; connection-search triggers populated searchable job facets; keyset reads executed for jobs, connections, notifications, verifications, and media; atomic automated moderation claiming returned one queued item.

## Findings

### P1 - List Responses Cause N+1 Public-Identifier Lookups

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/jobs/JobsService.java:41-45,78-80,121-126,356-373` publicizes each job/application through a repository query.
- `api-java/src/main/java/com/illamhelp/api/connections/ConnectionsService.java:29-34,112-132` performs up to three public-user lookups for each listed connection.
- `api-java/src/main/java/com/illamhelp/api/consent/ConsentService.java:33-42,180-193` performs up to two username lookups per request or grant.

**Impact**

Jobs list becomes up to `2N + 2` database calls for `N` results; connections becomes up to `3N + 2`; consent becomes up to `2N + 1`. Latency grows with network round trips rather than only result size, and connection pool pressure rises quickly under concurrent reads.

**Improvement**

Return public identifiers in the repository projection by joining the required `users` aliases in the list query, or perform one batched `WHERE id IN (...)` lookup per response and map in memory. Prefer typed Spring Data projections over raw maps while touching these queries.

**Target Complexity**

Reduce database calls from `O(N)` to `O(1)` per endpoint response, while retaining `O(N)` output construction.

### P1 - Consent Grants Can Race And Duplicate Active Authorization

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/consent/ConsentService.java:81-117` reads pending state, separately checks `hasActiveGrant`, approves the request, then inserts a grant.
- `api-java/src/main/java/com/illamhelp/api/consent/ConsentRepository.java:56-92` implements those as separate repository statements.
- `infra/db/migrations/V0001__baseline.sql:180-204,304-311` has lookup indexes but no uniqueness constraint for active grants.

**Impact**

Concurrent grant requests can both observe no active grant and insert active grants for the same owner/grantee/connection. This is an authorization data-integrity failure, and duplicate rows also increase every future consent-read cost.

**Improvement**

Make approval and grant creation atomic and conditioned on a pending request. Add a database-enforced active-grant invariant. Because expiring rows complicate a partial unique predicate based on `now()`, either permit one non-revoked grant per relationship and revoke/replace it explicitly, or maintain a single active authorization row with expiration checked on reads.

**Target Complexity**

Eliminate race-prone read-before-write queries and make failure constant-time through a constraint/conditional write.

### P1 - Booking And Review State Transitions Are Not Fully Atomic

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/jobs/JobsService.java:129-154,208-333` validates previously read state and then applies separate state updates.
- `api-java/src/main/java/com/illamhelp/api/jobs/JobRepository.java:175-240` has unconditional application/status writes; `assignProvider` is conditional but returns `void`, so callers cannot detect a lost race.
- `api-java/src/main/java/com/illamhelp/api/connections/ConnectionsService.java:75-109` reads a pending connection then performs an update without an expected-state predicate.
- `api-java/src/main/java/com/illamhelp/api/media/MediaModerationService.java:102-129` selects a pending review job, then completes it with an unconditional update.
- `api-java/src/main/java/com/illamhelp/api/media/MediaAssetRepository.java:122-155` does not condition human review completion on `status = 'pending'`.

**Impact**

Concurrent accepts, decisions, booking transitions, or moderation actions can overwrite state, send conflicting notifications, or produce audit events for a transition that no longer succeeded.

**Improvement**

Express each lifecycle transition as a conditional repository mutation returning the changed row, such as `UPDATE ... WHERE id = :id AND status = :expected RETURNING ...`. Use an atomic CTE for accepting an application and assigning its job, or lock the job row with `FOR UPDATE`. Add optimistic versions where entities participate in normal JPA updates. Emit side effects only after a transition returns a row.

**Target Complexity**

Keep the transition `O(1)` while removing compensating work, duplicate notifications, and inconsistent recovery paths.

### P1 - Unbounded Consent And Media Reads Have Unbounded Response Cost

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/consent/ConsentRepository.java:17-34` returns all consent requests and grants for a user.
- `api-java/src/main/java/com/illamhelp/api/media/MediaAssetRepository.java:12-27` returns all user or approved public media rows.
- `api-java/src/main/java/com/illamhelp/api/media/MediaService.java:41-51` also creates a presigned download URL for every approved media row.
- `web/src/lib/api.ts:642-646,720-725` and `mobile/src/api.ts:673-685,763-771` currently consume these routes as arrays, with no pagination envelope.

**Impact**

Time and heap use grow with all historical records, and the public media endpoint performs unbounded signing work. A large account can produce slow responses or memory pressure without unusual request volume.

**Improvement**

Add bounded cursor pagination using `(created_at, id)`, with an enforced maximum page size. Since web/mobile clients currently expect arrays, first introduce a backward-compatible cap and new paged endpoint/query contract, then migrate clients before requiring cursor responses.

**Target Complexity**

Move request time and response memory from `O(total user history)` to `O(page size)`.

**Implemented**

Consent and media repositories now use `(created_at, id)` keyset reads limited to `page size + 1`, services return `nextCursor`, and web/mobile adapters consume the new page envelope. Public media now creates presigned URLs only for the bounded page contents.

### P1 - Connection Search Reaggregates And Scans The Search Corpus Per Request

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/connections/ConnectionRepository.java:24-58` aggregates categories and locations across `jobs`, constructs search text across user/profile rows, then applies substring and token checks before limiting results.
- `infra/db/migrations/V0001__baseline.sql:287-325` has no GIN full-text/trigram search index or precomputed search document supporting this query.

**Impact**

The request cost approaches `O(J + U * T)` for jobs `J`, users `U`, and query tokens `T`, even though only 20 records are returned. This path will degrade early as profile and job counts rise.

**Improvement**

Create a maintained candidate search document and use PostgreSQL full-text search (`tsvector` plus GIN) or `pg_trgm` where substring matching is required. Maintain recent-job facets incrementally or asynchronously rather than aggregating all jobs for each search. Filter and limit candidate identities before attaching display facets.

**Target Complexity**

Replace full-corpus per-request construction with index-driven candidate lookup, then enrich only the small result page.

**Implemented**

`connection_search_documents` is maintained by user/profile/job triggers in the disposable baseline schema, with GIN text/vector indexes and cached job facets. `ConnectionRepository` searches this projection and joins display users after filtering.

### P1 - Job Search Fallback Uses Non-Sargable Filters And Ranking Inputs

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/jobs/JobRepository.java:35-68` searches multiple `lower(column) LIKE '%...%'` expressions, parses comma-separated status and preferred-ID strings, casts `j.id` to text, and calculates spherical distance in SQL.
- `api-java/src/main/java/com/illamhelp/api/jobs/JobsService.java:69-80` always invokes that query after OpenSearch IDs are returned to apply visibility.
- `infra/db/migrations/V0001__baseline.sql:289-293` provides ordinary B-tree indexes, which do not accelerate contains-text filters or radius distance calculations in this form.

**Impact**

The PostgreSQL fallback may scan and compute over a large visible-job set. Even successful OpenSearch queries can lose much of their benefit during the SQL visibility/ranking step.

**Improvement**

Pass ranked OpenSearch IDs as a typed UUID relation (`unnest(... WITH ORDINALITY)`) and join by UUID. For fallback text search use indexed `tsvector`/trigram expressions. For meaningful geographic volume, add PostGIS `geography` with GiST indexing or at minimum an indexed bounding-box prefilter before exact distance.

**Target Complexity**

Make OpenSearch-backed lookup proportional to the returned ID set, and make fallback filtering index-assisted instead of row-computation dominated.

### P2 - Network Calls Occur Inside Database Transactions

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/jobs/JobsService.java:83-94,129-154,255-281,319-333` indexes in OpenSearch while transactional mutations are active.
- `api-java/src/main/java/com/illamhelp/api/jobs/JobsSearchService.java:46-63` performs synchronous HTTP indexing with `refresh=wait_for`.
- `api-java/src/main/java/com/illamhelp/api/media/MediaService.java:54-103` signs or verifies storage objects while methods are transactional.

**Impact**

Database transactions remain open during OpenSearch or object-storage latency. This increases lock duration, pool occupancy, tail latency, and the likelihood that an external timeout rolls back otherwise valid database work.

**Improvement**

Keep domain mutation plus an outbox record in one short transaction, then publish indexing/notifications after commit. Verify object-storage metadata before opening the short conditional DB state-transition transaction. The existing `internal_event_outbox` pattern can be extended for indexing and delivery work.

**Target Complexity**

Query count may remain similar, but transaction holding time changes from `DB work + external latency` to `DB work` only.

**Implemented**

OpenSearch indexing is registered after commit. Media upload signing is computed before its database transaction, and completion performs object-store verification before `MediaMutationService` enters the short state/audit/outbox transaction.

### P2 - Audit Events Are Independent Of Domain Transactions

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/audit/AuditService.java:17-24` always writes through `Propagation.REQUIRES_NEW`.
- Audit writes occur from transactional state-changing flows such as `JobsService`, `ConsentService`, and `MediaModerationService`.

**Impact**

An audit event can commit even if the enclosing domain operation later rolls back. Each event also creates a separate transaction; batch moderation and bulk revocation amplify transaction churn.

**Improvement**

For business transition audit records, write in the same transaction as the changed state. If nonrepudiation requires recording failed attempts, model attempted/committed outcomes explicitly rather than accidentally committing success events. For high-volume events, write transactional outbox/audit rows in batches.

**Target Complexity**

Reduce extra transaction overhead from `O(events)` nested transactions while restoring event/state consistency.

### P2 - In-Memory Rate-Limit State Grows Without Eviction And Does Not Scale Out

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/config/RequestGuardFilter.java:25,118-126` keeps buckets in a `ConcurrentHashMap` and replaces expired values only when the same key is seen again; it does not evict dormant identities.

**Impact**

Memory usage is `O(unique rate-limit keys since process start)`. With multiple API instances, each replica also enforces an independent partial limit.

**Improvement**

Use Redis-backed rate limits with TTL and atomic increments/sliding windows for deployable behavior. If a local-only mode remains in process, use bounded, expiring cache entries and expose bucket/eviction metrics.

**Target Complexity**

Bound memory to `O(active identities in the rate-limit window)` and make limits consistent across instances.

**Implemented**

`RedisRateLimitStore` applies an atomic increment with Redis TTL under the existing rules, selected by `REDIS_RATE_LIMIT_ENABLED`. The in-process evicting map remains available as a bounded availability fallback when Redis cannot be reached.

### P2 - Feed Pagination Uses Large Offsets And Repeat Counts

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/jobs/JobRepository.java:12-33`, `ConnectionRepository.java:11-22`, `NotificationRepository.java:25-42`, and `profiles/VerificationRequestRepository.java:39-53` use offset pagination and companion counts.
- `api-java/src/main/java/com/illamhelp/api/notifications/NotificationService.java:26-33` issues list, total-count, and unread-count queries for every list refresh.

**Impact**

Deep pages become `O(offset + page size)` in the database, while polling notification pages repeatedly computes totals users may not need for each refresh.

**Improvement**

Use keyset pagination on ordered `(created_at, id)` feeds. Separate total/unread retrieval from ordinary refreshes, or refresh counters less often. Maintain existing envelopes during a client transition by adding cursors alongside the current fields.

**Target Complexity**

Change deep-page reads from offset-dependent work to `O(page size)`, and reduce routine notification refresh database calls from three to one where counts are not requested.

**Implemented**

All listed feed repositories now seek on their stable timestamp and UUID order rather than using offsets. Corresponding UI surfaces retain `nextCursor` and show explicit continuation commands. Notification lists retain the unread badge count but no longer calculate an unused list total.

### P2 - Moderation Processing Is A Long Synchronous Batch Transaction

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/media/MediaModerationService.java:64-100,132-177` selects up to 200 jobs and processes them inside one transaction with multiple writes and audit operations per item.
- `api-java/src/main/java/com/illamhelp/api/media/MediaAssetRepository.java:100-120` first lists pending jobs, then claims rows individually; parallel processors can select the same candidate set and discard failed claims.
- `infra/db/migrations/V0001__baseline.sql:313` indexes moderation by `(media_asset_id, stage, status)`, not by pending queue order.

**Impact**

Batch duration, locks, statement count, and response latency grow linearly with limit. Competing workers perform avoidable selection/claim work and the queue scan lacks a supporting index.

**Improvement**

Process moderation as background work. Claim rows atomically with `FOR UPDATE SKIP LOCKED` or an `UPDATE ... RETURNING` claim query, commit per item or small bounded batch, and add a partial queue index on `(stage, created_at, id) WHERE status = 'pending'`.

**Target Complexity**

Preserve linear total work while bounding transaction duration and eliminating most duplicate selection between workers.

**Implemented**

`MediaAutomatedModerationWorker` atomically claims one pending automated job and processes it in one short transaction. `MediaModerationScheduler` drains a configured bounded batch on an interval, while concurrent instances safely skip locked work. The admin endpoint delegates through the same per-item worker instead of wrapping a batch transaction.

### P2 - Several Repository Query Patterns Need Supporting Indexes

**Evidence**

- Media listing sorts by `created_at` after filtering owner/state (`MediaAssetRepository.java:12-27`), but the schema has only `(owner_user_id, state)` (`V0001__baseline.sql:312`).
- Pending moderation queues sort by `created_at` (`MediaAssetRepository.java:100-106`) without a queue-order index (`V0001__baseline.sql:313`).
- Verification administration filters by status then sorts by time (`VerificationRequestRepository.java:39-53`), while the schema has separate status/time indexes (`V0001__baseline.sql:319-321`).
- Visible jobs include assigned-provider reads (`JobRepository.java:12-24`), but no index begins with `assigned_provider_user_id`.

**Impact**

As table sizes grow, valid bounded requests still incur sorting or broader scanning than necessary.

**Improvement**

Validate with representative plans, then add forward Flyway migrations for:

- `media_assets (owner_user_id, created_at DESC, id DESC)` and a partial approved-public equivalent.
- `moderation_jobs (stage, created_at, id) WHERE status = 'pending'`.
- `verification_requests (status, created_at DESC, id DESC)`.
- `jobs (assigned_provider_user_id, created_at DESC, id DESC) WHERE assigned_provider_user_id IS NOT NULL`.
- Full-text/trigram/geospatial indexes selected for the search redesign rather than speculative B-tree additions.

**Target Complexity**

Keep page retrieval index-ordered and avoid memory sorts/scans for common bounded queries.

### P2 - Missing-Row Mutations Can Produce Server Errors Instead Of Contract Errors

**Evidence**

- `api-java/src/main/java/com/illamhelp/api/consent/ConsentService.java:120-132` dereferences the result of `revokeGrant` without handling a missing or unauthorized row.
- `api-java/src/main/java/com/illamhelp/api/profiles/VerificationService.java:65-75` reads fields from `findReviewTarget` without checking that a request exists.

**Impact**

Invalid or stale identifiers can become `500` responses instead of controlled `404` or conflict errors. This is correctness and API-resilience debt rather than a primary performance problem.

**Improvement**

Require repository mutations/reads to return an optional/result contract and map missing rows through the global API exception shape. Cover stale IDs and repeated actions with Mockito and integration tests.

## Database Evolution Note

The service currently uses Flyway as schema authority and Hibernate validation (`spring.jpa.hibernate.ddl-auto=validate`). That is the correct production-friendly direction for constraints and performance indexes: JPA validates mappings, while explicit migrations make data and index changes reviewable and reproducible.

Because the baseline file states it may still be rewritten before a data-bearing environment exists, changes can be consolidated there only while the database is disposable. Once any shared or persistent environment applies `V0001__baseline.sql`, freeze it and introduce `V0002__...` onward for all constraints and indexes identified above.

## Recommended Delivery Order

1. Fix transition atomicity and consent active-grant enforcement; add concurrency integration tests.
2. Remove N+1 identifier lookups in jobs, connections, and consent with joined or batched projections.
3. Seed representative volumes and measure the new indexed search/feed paths with stored query plans and latency results.
4. Decide whether production geographic discovery warrants PostGIS/GiST indexing beyond the current bounded fallback strategy.

## Verification Plan

- Add PostgreSQL integration tests for concurrent job acceptance, consent grant duplication, moderation review collision, and connection decisions.
- Add Mockito tests asserting failed conditional mutations do not call notifications, audit-success paths, or search indexing.
- Seed representative jobs/connections/media/notifications data and record `EXPLAIN (ANALYZE, BUFFERS)` before and after repository/index changes.
- Add endpoint performance tests for list/search/notification/moderation paths, recording query count, p95 latency, allocated response size, and transaction duration.
- Run existing `mvn test`, Bruno contract requests, and web/admin/mobile smoke flows after any response-envelope or lifecycle modification.

## Open Questions

- How much historical media and consent data should be shown in the first client release? This determines the safest pagination compatibility path.
- Is OpenSearch intended to be required in production, or must PostgreSQL search remain fully performant during outages?
- Should audit logs describe attempted operations as well as committed transitions? The answer determines whether separate failed-attempt audit events are needed after transactional audit writes are corrected.

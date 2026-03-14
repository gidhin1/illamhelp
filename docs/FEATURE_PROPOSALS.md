# IllamHelp — New Features & Enhancements Proposal

> Based on a full review of all API modules, frontends (web/admin/mobile), tests, infrastructure, and documentation as of 2026-03-05.

---

## 1. Complete Existing Roadmap Gaps (High Priority)

These items are already scoped in your milestones/docs but not yet implemented.

### 1.1 Auth Flows Completion
| Item | Status | Effort |
|---|---|---|
| **Token refresh endpoint** (`POST /auth/refresh`) | ✅ Done | Small |
| **Logout / session invalidation** (`POST /auth/logout`) | ✅ Done | Small |
| **Revocation propagation** to downstream caches | Not implemented | Medium |
| **MFA for admin/support roles** (TOTP via Keycloak) | Not implemented | Medium |
| **Password reset / forgot-password flow** | Not documented or implemented | Medium |

### 1.2 Provider Verification Workflow
| Item | Status | Effort |
|---|---|---|
| Provider document upload (ID, certification) | ✅ Done | Medium |
| Admin review + approve/reject verification | ✅ Done | Medium |
| Verified badge on provider profiles | ✅ Done | Small |
| Verification status tracking (timeline) | ✅ Done | Small |

### 1.3 Real-Time Revocation Propagation
- PII grants currently revoke in DB but don't invalidate read caches or active sessions
- Needed: Redis pub/sub or NATS-based revocation fanout to all API nodes
- Impact: core to the consent-first promise of the product

### 1.4 Consent-Aware Response Filtering (Global Middleware)
- Currently per-endpoint; should be a NestJS interceptor that masks PII fields automatically across all read APIs
- Removes the risk of new endpoints accidentally leaking PII

### 1.5 Media Processing Workers (Async Pipeline)
| Worker | Status | Effort |
|---|---|---|
| FFmpeg transcoding + normalization | Not implemented | Large |
| ClamAV virus scanning (container exists but no worker) | Not implemented | Medium |
| EXIF/metadata stripping (ExifTool) | Not implemented | Small |
| External AI moderation API integration (replacing heuristic baseline) | Not implemented | Large |

---

## 2. New Features — User Experience & Frontend

### 2.1 In-App Notifications Center
- **What**: Bell icon with unread count in NavBar; notification drawer showing connection requests, consent requests, job applications, booking status changes, moderation results
- **Why**: Users currently have no way to know about actions requiring their attention without manually navigating to each page
- **Status**: ✅ **Done** — Backend `NotificationService` + controller, web Alerts page, notification triggers wired into `ConnectionsService`, `JobsService`, and `VerificationService`
- **Effort**: Medium (API + web + mobile)

### 2.2 In-App Messaging / Chat
- **What**: Direct messaging between connected users (after mutual approval)
- **Why**: Listed as a core use case in PROJECT_SCOPE but completely absent
- **Tech**: WebSocket via NATS JetStream (already in architecture diagram) or Socket.IO
- **Effort**: Large

### 2.3 Job Detail Page with Application Flow
- **What**: Dedicated `/jobs/[id]` page (route exists but needs content) showing full job details, applicant list (for owner), apply button (for providers), booking status
- **Why**: The job detail page is a stub — the full apply → accept → start → complete flow isn't exposed in the web UI
- **Effort**: Medium

### 2.4 Dashboard / Home Feed (Authenticated)
- **What**: After login, replace the static hero with a personalized dashboard: recent jobs near you, pending connection requests, consent requests awaiting action, booking status
- **Why**: The homepage is static marketing copy even for logged-in users
- **Effort**: Medium

### 2.5 Search Page with Filters UI
- **What**: Dedicated search page or inline search with category, location, rating, and availability filters
- **Why**: `GET /jobs/search` is implemented backend but no search UI exists in web
- **Effort**: Medium

### 2.6 Ratings & Reviews UI
- **What**: After booking completion, prompt both parties to rate/review; show ratings on profiles and job listings
- **Why**: Listed in MVP scope but not implemented at all (no API, no UI)
- **Effort**: Large (API + web + mobile)

### 2.7 Service Category Browser
- **What**: Visual category cards (maid, electrician, plumber, cook, etc.) on homepage and as a navigation aid
- **Why**: Service category taxonomy is mentioned in scope but there's no browsable UI for it
- **Effort**: Small

### 2.8 Onboarding Flow (New User Wizard)
- **What**: Post-registration guided wizard: choose role context, complete profile, upload photo, set service area/preferences
- **Why**: Currently after registration users land on a blank profile page with no guidance
- **Effort**: Medium

### 2.9 Dark Mode Support
- **What**: Toggle or system-preference-based dark mode using existing CSS custom properties
- **Why**: The design token system in `@illamhelp/ui-tokens` is already structured for theming but only has one theme
- **Effort**: Small

### 2.10 Multi-Language Support (i18n)
- **What**: Tamil and Malayalam (and English) UI translations
- **Why**: Target market is Kerala + Tamil Nadu; many users prefer regional languages
- **Tech**: `next-intl` for web, `expo-localization` + `i18n-js` for mobile
- **Effort**: Large (ongoing)

---

## 3. New Features — Backend & API

### 3.1 Push Notifications Infrastructure
- **What**: FCM (Android) + APNs (iOS) push notification service; email notifications via transactional email (Resend, SendGrid, or self-hosted)
- **Why**: Listed in architecture diagram as "Notification Connectors" but nothing is implemented
- **Triggers**: New connection request, consent request, job application, booking state change, moderation result
- **Effort**: Large

### 3.2 Favorites / Saved Providers
- **What**: Let seekers bookmark/favorite providers or jobs for later
- **Why**: Common marketplace UX pattern; improves re-engagement
- **Effort**: Small

### 3.3 Availability Calendar for Providers
- **What**: Providers set weekly availability windows; seekers see availability when browsing
- **Why**: Reduces back-and-forth; enables future schedule-based matching
- **Effort**: Medium

### 3.4 Service Pricing / Rate Cards
- **What**: Providers set hourly/daily/fixed rates per service category; seekers see rates before connecting
- **Why**: Transparent pricing is in the product vision but not implemented
- **Effort**: Medium

### 3.5 Dispute Resolution Workflow
- **What**: After booking completion, either party can open a dispute; admin reviews evidence and adjudicates
- **Why**: Listed in Milestone 3 but no implementation; critical for trust
- **Effort**: Large

### 3.6 Abuse Reporting System
- **What**: "Report" button on profiles, jobs, and messages; admin queue for abuse reports
- **Why**: Mentioned in MVP scope ("basic moderation and abuse reporting") but only media moderation exists
- **Effort**: Medium

### 3.7 Webhook / Event Integration
- **What**: External webhook delivery for key events (booking completed, payment received, verification approved)
- **Why**: Enables third-party integrations and automation (e.g., accounting software, CRM)
- **Effort**: Medium

### 3.8 API Versioning Header Strategy
- **What**: Add `Accept-Version` or `API-Version` header support alongside URL prefix versioning
- **Why**: Currently only URL prefix `/api/v1`; header-based versioning enables smoother migrations
- **Effort**: Small

---

## 4. Trust & Safety Enhancements

### 4.1 Background Check Integration
- **What**: API adapter for police verification / background check services (Indian market: Aadhaar-based verification, DigiLocker)
- **Why**: High trust requirement for domestic workers entering homes
- **Effort**: Large (external partner dependent)

### 4.2 Emergency Contact / SOS Feature
- **What**: In-app panic button during active bookings that alerts emergency contacts and shares location
- **Why**: Safety-critical for domestic services; strong differentiator
- **Effort**: Medium

### 4.3 Location Verification (Check-In/Check-Out)
- **What**: GPS-based check-in when provider arrives; checkout when service is complete
- **Why**: Enables time-based billing, safety verification, and dispute evidence
- **Effort**: Medium

### 4.4 Provider Skill Certification Badges
- **What**: Verified certifications (e.g., licensed electrician, food safety certification) displayed as badges
- **Why**: Builds trust beyond generic verification
- **Effort**: Small (depends on provider verification workflow)

### 4.5 Content Publishing Module
- **What**: CMS for platform announcements, safety guides, how-to articles, and seasonal tips
- **Why**: Listed in architecture ("Content and Ads" domain) but not implemented
- **Effort**: Medium

---

## 5. Operational & Admin Enhancements

### 5.1 User Management in Admin Portal
- **What**: Search users, view complete user profile, suspend/ban users, reset passwords
- **Why**: Admin portal currently has moderation queue and audit timeline but no user management
- **Effort**: Medium

### 5.2 Analytics Dashboard
- **What**: Admin dashboard with key metrics: active users, jobs posted/completed, connections made, moderation SLA, revenue (future)
- **Why**: No operational visibility beyond audit logs
- **Effort**: Medium

### 5.3 Moderation Analytics & SLA Tracking
- **What**: Charts showing moderation queue depth, average review time, approval vs rejection rates, SLA breach alerts
- **Why**: Listed in Milestone 3 but not implemented
- **Effort**: Medium

### 5.4 Media Appeal Flow
- **What**: Users can appeal rejected media with additional context; admin re-reviews
- **Why**: Listed in Milestone 3 but not implemented
- **Effort**: Small

### 5.5 Observability Stack
- **What**: Deploy OpenTelemetry + Prometheus + Grafana + Loki + Tempo as defined in ARCHITECTURE.md
- **Why**: Listed in architecture but not set up; currently zero observability beyond application logs
- **Effort**: Large

### 5.6 OpenTofu / IaC for Staging
- **What**: Infrastructure-as-code for reproducibly deploying staging environment
- **Why**: Listed in Milestone 0 as pending; blocking staging validation
- **Effort**: Large

---

## 6. Developer Experience Improvements

### 6.1 API Documentation Enhancement
- **What**: Add request/response examples to all Swagger endpoints; add Postman/Bruno collection for every new feature
- **Why**: Swagger exists but is auto-generated without examples
- **Effort**: Small (ongoing)

### 6.2 Database Seeding Script
- **What**: Script to populate development database with realistic sample data (users, jobs, connections, media)
- **Why**: Currently developers must manually create all test data; slows down feature development and demo prep
- **Effort**: Small

### 6.3 Storybook for UI Components
- **What**: Component library documentation using Storybook for `web` and `admin` shared components
- **Why**: Components in `primitives.tsx` are growing but undocumented
- **Effort**: Medium

### 6.4 E2E Test Stability
- **What**: Use Maestro for mobile UI E2E and add visual regression testing for web
- **Why**: Mobile E2E is flagged as unstable; no visual regression protection
- **Effort**: Medium

### 6.5 Monorepo Build Caching
- **What**: Add Turborepo or Nx for build/test caching across workspaces
- **Why**: As the monorepo grows, build times will increase; caching saves CI time
- **Effort**: Small

---

## 7. Growth & Monetization Features (Phase 2+)

### 7.1 Payment Gateway Integration
- **What**: Razorpay/UPI adapter for in-app payments + payout scheduling for providers
- **Why**: Listed in Milestone 3 but not implemented; architecture-ready per scope
- **Effort**: Large

### 7.2 Subscription / Premium Tiers
- **What**: Free tier (limited applications/month) + premium tier (unlimited, priority listing, verification badge)
- **Why**: Monetization path for providers; seekers get more visibility for premium jobs
- **Effort**: Large

### 7.3 Referral System
- **What**: Invite codes that reward both referrer and new user (credits, priority listing)
- **Why**: Low-cost growth mechanism for marketplace bootstrapping
- **Effort**: Medium

### 7.4 Location-Based Recommendations
- **What**: "Providers near you" using geo coordinates from user profile or device location
- **Why**: Geo search backend exists but no recommendation surface leverages it
- **Effort**: Medium

### 7.5 Repeat Booking / Recurring Jobs
- **What**: Allow seekers to set up recurring schedules (weekly cleaning, daily cooking)
- **Why**: Domestic services are inherently recurring; one-off booking model adds friction
- **Effort**: Large

---

## Prioritization Summary

### 🔴 Do First (Blocking / High Impact)
1. ~~Auth flows completion (refresh, logout)~~ — ✅ **Done**
2. ~~Provider verification workflow~~ — ✅ **Done**
3. Job detail page + application flow UI — backend exists, UI missing
4. ~~In-app notifications + notification triggers~~ — ✅ **Done** (API + web frontend + triggers wired for connections/jobs/verification)
5. ~~Fix all active bugs from CODEBASE_AUDIT_REPORT~~ — ✅ **All 12 bugs fixed** (0 remaining)

### 🟡 Do Next (High Value / Medium Effort)
6. Search page with filters UI
7. Ratings & reviews (API + UI)
8. Abuse reporting system
9. User management in admin portal
10. Real-time revocation propagation
11. Push notifications infrastructure
12. Dashboard for logged-in users
13. Consent-aware global middleware

### 🟢 Do Later (Enhancers / Large Effort)
14. In-app messaging
15. Payment gateway integration
16. Multi-language support
17. Background check integration
18. Observability stack
19. Recurring bookings
20. Analytics dashboard

### 🔵 Nice to Have (Low Effort / Polish)
21. Dark mode
22. Service category browser
23. Favorites / saved providers
24. Database seeding script
25. Media appeal flow
26. API docs enhancement

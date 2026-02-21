# Project Scope

## Product Name

`IllamHelp`

## Vision

Build a trusted, secure, mobile-first marketplace for household services where:

- Homeowners can quickly find verified help.
- Service providers can discover jobs and grow income.
- Both sides can transact safely with transparent pricing and ratings.
- Initial regional focus is Kerala and Tamil Nadu, with expansion-ready architecture.

## User Roles

- Service Seeker (homeowner/tenant)
- Service Provider (maid, electrician, plumber, carpenter, cleaner, babysitter, cook, etc.)
- Admin/Moderator
- Support Agent

## Core Use Cases

1. User registration and secure login
2. Service provider profile creation and verification
3. Service seeker posts a job/ad with location, schedule, and budget
4. Matching and discovery (search + recommendation + manual browse)
5. Quote negotiation, booking, and job status tracking
6. In-app messaging and notifications
7. Payments (optional for MVP, but architecture-ready)
8. Ratings, reviews, and dispute resolution
9. Content publishing (tips, safety guides, promotional content)
10. Upload and download service-related images/videos with strict approval checks
11. Mutual-acquaintance workflow before any direct PII/contact exchange
12. Owner-controlled PII/contact sharing with revocation support

## MVP Boundaries

### In Scope

- Email/phone authentication with strong access controls
- Role-based profiles (provider and seeker)
- Job posting and application flow
- Service category taxonomy
- Search and filtering (category, distance, rating, availability)
- Booking lifecycle (`posted -> accepted -> in_progress -> completed -> reviewed`)
- Ratings and reviews
- Basic moderation and abuse reporting
- Admin dashboard for content and user operations
- Provider and seeker media upload for profiles, job evidence, and portfolio
- Mandatory dual moderation (AI + human) before any media is publicly visible
- Download enabled only for approved media with secure access controls
- Mutual approval handshake between two users before consent requests are allowed
- PII/contact visibility controlled by data owner consent (per data type)
- Data owner can revoke previously shared PII/contact at any time

### Out of Scope (Phase 2+)

- Dynamic surge pricing
- AI voice assistant
- Multi-country tax/localization engine
- Insurance product bundling

## Non-Functional Targets (Initial)

- API availability: `99.9%`
- P95 API latency: `< 300 ms` for core endpoints
- P95 search latency: `< 500 ms`
- Mobile cold-start: `< 3 sec` on mid-range devices
- Zero critical vulnerabilities in production images
- `0` unreviewed images/videos publicly visible
- P95 moderation decision SLA: `< 30 minutes` for standard queue
- PII revocation propagation to all read APIs: `< 60 seconds`

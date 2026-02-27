# Tech Stack (Free/Open-Source, Security-First)

Validated on: `2026-02-21`

## Principles

- Use free/open-source tools for core platform capabilities.
- Prefer LTS/stable releases over beta channels.
- Enforce security baselines in CI/CD from day one.

## Recommended Stack

| Layer | Technology | Version Posture | Why |
|---|---|---|---|
| Mobile App | Expo (React Native) + TypeScript | Expo SDK `52` (React Native `0.76.x`) | Stable cross-platform stack with fast iteration and free tooling |
| Admin Web | Next.js | `16.x` stable | Fast dashboard development with SSR/ISR and strong tooling |
| API | NestJS + Fastify | NestJS `11.x` | Modular enterprise backend architecture with performance-oriented adapter |
| Runtime | Node.js | `24.x LTS` | Long support window and current performance/security baseline |
| Primary DB | PostgreSQL | `18.x` | Reliable ACID transactions, mature indexing, extension ecosystem |
| Cache/Queue | Redis Open Source | `8.x` | Fast caching, rate limits, queue primitives |
| Search | OpenSearch | `3.x` | Open-source text + geo search for matching use cases |
| Object Storage | MinIO | latest stable | S3-compatible storage for profile media and KYC docs |
| AuthN/AuthZ | Keycloak | `26.x` | Open-source OIDC/OAuth2 server with RBAC and MFA support |
| API Gateway | Kong OSS | latest stable | Rate limiting, auth policies, and edge controls |
| Event Bus | NATS JetStream | latest stable | Lightweight event streaming for async workloads |
| Policy Engine | Open Policy Agent (OPA) | latest stable | Server-side authorization and PII consent policy evaluation |
| Media Processing | FFmpeg, ExifTool, ClamAV | latest stable | Transcode, sanitize metadata, and antivirus scan uploaded media |
| AI Moderation | PyTorch + OpenCLIP + NudeNet + YOLO (self-hosted) | latest stable | Free/open-source vision pipeline for relevance and safety scoring |
| OCR for Media Review | Tesseract OCR | latest stable | Detect phone numbers, emails, and spam overlays in images/videos |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Tempo, Alertmanager | latest stable | Full free stack for tracing, metrics, logs, alerts |
| IaC | OpenTofu | `1.10.x` | Free/open Terraform-compatible infrastructure management |
| GitOps/CD | Argo CD + GitHub Actions | latest stable | Reproducible deployments with policy-based delivery |
| Security Scanning | Trivy, Gitleaks, Semgrep, OWASP ZAP | latest stable | SCA, secrets detection, SAST, and DAST in CI |

## Mobile Client Libraries

- Navigation: `react-navigation`
- API caching/state sync: `@tanstack/react-query`
- Local app state: `zustand`
- Form + validation: `react-hook-form` + `zod`
- Secure storage: OS keychain/keystore abstractions

## Security Baseline

- OWASP ASVS Level 2 target for backend
- OWASP MASVS controls for mobile client
- TLS 1.3 everywhere
- MFA for privileged users
- SBOM generation and signed container images
- Dependency updates automated with approval gates
- Unreviewed media is never served publicly
- All media must pass AI review and human review before public display
- Signed short-lived URLs only for media download access

## Cost and Tooling Note

Core platform tooling above is free/open-source. Two categories usually require paid external providers:

- Payment processing (gateway transaction fees)
- Telecom delivery (SMS/OTP costs)

These integrations should remain adapter-based so providers can be swapped without core architecture changes.

## Source References (Official)

- Expo SDK 52 release notes: https://blog.expo.dev/expo-sdk-52-3e9b1caa6e83
- Next.js 16 release: https://nextjs.org/blog/next-16
- Node.js release schedule/LTS table: https://nodejs.org/en/about/previous-releases
- PostgreSQL 18.2 release notes: https://www.postgresql.org/docs/release/18.2/
- Redis Open Source 8.0 announcement: https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisce-8.0-release-notes/
- OpenSearch version history (3.x): https://docs.opensearch.org/latest/version-history/
- Keycloak latest releases: https://github.com/keycloak/keycloak/releases
- NestJS releases: https://github.com/nestjs/nest/releases
- OpenTofu releases: https://github.com/opentofu/opentofu/releases

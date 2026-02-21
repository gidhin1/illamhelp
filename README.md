# IllamHelp

Project planning and architecture documentation for an enterprise-grade mobile marketplace that connects households with verified domestic workers across Kerala and Tamil Nadu.

This baseline is designed around free/open-source tools and security-first architecture.

## Documentation Index

- `docs/PROJECT_SCOPE.md`: Business goals, user types, MVP scope, and non-goals.
- `docs/ARCHITECTURE.md`: System architecture, domain modules, data flow, and scaling strategy.
- `docs/TECH_STACK_2026.md`: Recommended stack and version posture (validated against current official sources).
- `docs/TASKS_AND_MILESTONES.md`: Delivery phases, implementation tasks, and acceptance criteria.
- `docs/PROJECT_RULES.md`: Product, engineering, security, and operations rules.
- `docs/MEDIA_MODERATION_POLICY.md`: Strict image/video upload, moderation, approval, and public display policy.
- `docs/PII_CONSENT_POLICY.md`: Mutual-approval contact sharing, owner consent grants, and revocation rules.

## Working Model

- Build fast with a modular monolith and clear domain boundaries.
- Extract high-load domains into services only when metrics justify it.
- Keep trust and safety (verification, moderation, disputes) as first-class features from day one.
- Prefer free/open-source tooling for all core platform capabilities.

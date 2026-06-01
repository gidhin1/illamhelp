# Product

## Register

product

## Users

IllamHelp serves households in Kerala and Tamil Nadu who need trusted help at home, service providers who want a reliable way to find work, and operations teams who review profiles, media, verification requests, and safety signals. Customer-facing web and mobile users are often trying to finish a practical task quickly: register, describe a service need, find suitable providers or jobs, agree on work, manage contact sharing, and track status without learning technical language.

Admins, moderators, support agents, and future operations staff need denser views, clear queues, decision history, and fast ways to act without losing the human context behind each case.

## Product Purpose

IllamHelp exists to make household service hiring safer, clearer, and more accountable. The product should help seekers find verified help, help providers grow income with fair visibility, and give both sides simple controls for privacy, media approval, contact sharing, booking status, and support.

Success means users can understand what to do next, trust why a person or job is visible to them, recover from mistakes, and complete core flows on mobile or web without needing support.

## Brand Personality

Trusted, clear, practical.

The product voice should feel calm and direct. Customer-facing copy should use normal business and household-service language. Avoid technical terms such as grant, token, claim, policy engine, role, permission boundary, JWT, or internal system names in customer-facing web and mobile UI. Translate system concepts into human actions: share contact details, stop sharing, request access, review photo, verify profile, apply for job, cancel booking.

Admin and support surfaces may use more operational language, but should still prefer plain terms where precision is not lost.

## Anti-references

Avoid flashy gig-marketplace patterns that overpromise speed while hiding safety and verification details. Avoid technical console language in customer-facing flows. Avoid generic SaaS dashboards with vague cards, decorative metrics, and unclear next actions. Avoid legalistic privacy copy that makes consent feel like paperwork rather than a user-controlled choice.

Customer-facing web and mobile UI must not expose implementation terms such as grants, claims, tokens, resource policies, Keycloak, OPA, or internal event names. If a backend concept is necessary, rewrite it as a user outcome or business action.

Industry-standard anti-references for this product:

- Low-contrast marketplace UIs where ratings, prices, and safety signals blend into muted text.
- Dark technical admin-console styling on customer pages.
- Over-decorated trust badges that replace real verification status.
- Modal-heavy workflows for ordinary actions that could happen inline.
- Empty states that only say nothing is available instead of guiding the next useful action.

## Design Principles

1. Make trust inspectable. Verification, media approval, consent, and booking status should be visible enough for users to understand why they can trust the next step.
2. Use household-service language. Customer-facing screens should describe tasks, people, locations, contact sharing, jobs, bookings, and reviews in plain terms.
3. Put the next action in reach. Every workflow should make the safe next step obvious, especially on mobile.
4. Preserve control. Users should know what information is shared, who can see it, and how to stop sharing it.
5. Keep operations efficient. Admin and support surfaces should favor scanability, queue clarity, consistent controls, and fast review decisions.

## Accessibility & Inclusion

Target WCAG 2.2 AA across customer-facing web, mobile, and admin surfaces.

Design and implementation expectations:

- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful UI graphics.
- Provide visible keyboard focus states and complete keyboard navigation for web and admin workflows.
- Use semantic controls, accessible names, and screen-reader-friendly status updates for form errors, loading states, and review outcomes.
- Keep touch targets at least 44 by 44 CSS pixels on mobile.
- Respect reduced motion preferences and avoid motion that blocks task completion.
- Do not rely on color alone for status, risk, verification, or consent state.
- Write form labels, errors, and empty states in simple language suitable for non-technical users.

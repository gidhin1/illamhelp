---
name: IllamHelp
description: Trusted household-service marketplace UI for web, mobile, and admin operations.
colors:
  background-clear: "#FAFAFE"
  background-soft-lilac: "#F0EEF8"
  surface-white: "#FFFFFF"
  surface-lilac: "#F5F3FC"
  surface-hover-lilac: "#EDEBF7"
  ink-deep-plum: "#1A1625"
  muted-plum: "#6B6580"
  trust-indigo: "#6A5ACD"
  trust-indigo-bright: "#8B7CF7"
  soft-violet: "#A78BFA"
  success-green: "#22C55E"
  success-text: "#15803D"
  error-red: "#EF4444"
  error-text: "#B91C1C"
  warning-amber: "#F59E0B"
  warning-text: "#92400E"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  3xl: "48px"
  4xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.trust-indigo}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.surface-lilac}"
    textColor: "{colors.ink-deep-plum}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    typography: "{typography.label}"
  card-default:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-deep-plum}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input-default:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-deep-plum}"
    rounded: "{rounded.md}"
    padding: "12px"
---

# Design System: IllamHelp

## 1. Overview

**Creative North Star: "The Reliable Service Desk"**

IllamHelp should feel like a calm, capable service desk for household work: clear enough for families posting urgent needs, sturdy enough for providers managing income, and disciplined enough for moderators handling trust and safety. The visual system is a restrained product interface, not a campaign surface. It uses light, legible surfaces, one controlled indigo brand accent, and familiar task patterns so users focus on people, jobs, privacy, and booking state.

The customer-facing web and mobile experience must use household-service language. Product copy should say "share contact details", "stop sharing", "apply for job", "review photo", and "cancel booking", not grant, token, claim, policy engine, Keycloak, OPA, or other internal terms. Admin can be denser, but the system still earns trust through plain labels, visible states, and consistent controls.

**Key Characteristics:**

- Restrained color: indigo is used for primary actions, current selections, and important state.
- High readability: Inter for task text, Space Grotesk for page titles and section hierarchy.
- Practical density: customer pages stay comfortable; admin pages may be denser and scan-first.
- Explicit trust state: verification, media review, consent, and booking progress are always visible.
- Shared tokens: web and mobile use `@illamhelp/ui-tokens` as the source of truth.

## 2. Colors

The palette is a light product surface with a purple-indigo trust accent and clear semantic colors for success, warning, and error.

### Primary

- **Trust Indigo** (`#6A5ACD`): primary actions, active navigation, important status, and trusted confirmation moments.
- **Bright Trust Indigo** (`#8B7CF7`): hover accents, gradients already present in primary buttons, and lighter emphasis where contrast remains AA.

### Secondary

- **Soft Violet** (`#A78BFA`): pending or gentle emphasis, never body text on light backgrounds without a darker companion.

### Neutral

- **Clear Background** (`#FAFAFE`): default page background.
- **Soft Lilac Background** (`#F0EEF8`): alternate bands, pill backgrounds, and quiet grouping.
- **Surface White** (`#FFFFFF`): cards, forms, tables, and primary content surfaces.
- **Surface Lilac** (`#F5F3FC`): soft cards, secondary buttons, and low-emphasis containers.
- **Deep Plum Ink** (`#1A1625`): all primary text.
- **Muted Plum** (`#6B6580`): supporting text only where contrast remains at least 4.5:1.

### Named Rules

**The Ten Percent Accent Rule.** Indigo should carry decisions and orientation, not decorate every surface. If more than roughly one tenth of a screen is saturated accent, reduce it.

**The Plain-State Rule.** Status colors must always travel with text or icon meaning. Do not rely on color alone for pending, approved, rejected, warning, or error states.

## 3. Typography

**Display Font:** Space Grotesk with system fallback  
**Body Font:** Inter with system fallback  
**Label/Mono Font:** Inter with system fallback

**Character:** Space Grotesk gives headings a confident service-brand presence. Inter keeps task copy, labels, forms, and table content familiar and readable.

### Hierarchy

- **Display** (700, `36px`, `1.2`): page titles and major workspace headings. Use sparingly in product screens.
- **Headline** (700, `28px`, `1.2`): section-level headings and important empty-state titles.
- **Title** (700, `22px`, `1.25`): cards, modal titles, and dense panel headings.
- **Body** (400, `16px`, `1.5`): primary reading copy, descriptions, form help, and status explanations. Keep prose around 65-75ch.
- **Label** (600, `14px`, `1.4`): buttons, fields, table headers, compact metadata, and navigation labels.

### Named Rules

**The Human Label Rule.** Customer-facing labels must name the business action, not the implementation. Use "Request contact details", not "Create consent grant".

**The Product Scale Rule.** Product screens use fixed token sizes from `12px` through `36px`. Do not introduce oversized marketing typography inside task workflows.

## 4. Elevation

IllamHelp uses a hybrid of tonal layering, borders, and one ambient shadow token. Default cards may use the shared shadow, while soft cards and dense admin panels should prefer flat tonal layers with borders. Shadows support hierarchy; they are not decoration.

### Shadow Vocabulary

- **Default Ambient Shadow** (`0 20px 40px rgba(26, 22, 37, 0.10)`): default light-mode cards that need separation from the page background.
- **Dark Ambient Shadow** (`0 20px 40px rgba(0, 0, 0, 0.40)`): dark-mode elevated cards only.

### Named Rules

**The Flat-When-Dense Rule.** Tables, admin queues, and repeated list rows should use borders and tonal backgrounds before shadows.

**The No Ghost-Card Rule.** Do not pair decorative wide shadows with extra decorative borders. If a surface needs a border, keep the shadow purposeful and inherited from the token.

## 5. Components

### Buttons

- **Shape:** full pill (`999px`) in the current web and admin CSS; use consistently for primary actions.
- **Primary:** trust indigo to bright indigo treatment with white text and `12px 24px` padding.
- **Hover / Focus:** hover may reduce opacity or use the bright indigo token. Focus must show a 3px visible outline offset by 2px.
- **Secondary / Ghost:** secondary uses `surface-lilac` with ink text and a token border. Ghost stays transparent and gains `surface-hover-lilac` on hover.

### Chips

- **Style:** pill shape, small label text, `4px 12px` padding, soft background, token border, and brand text.
- **State:** use chips for category, status, filters, and small emphasis. Pair color-coded states with explicit text.

### Cards / Containers

- **Corner Style:** gently curved cards (`18px`), not oversized rounded panels.
- **Background:** default cards use `surface-white`; soft cards use `surface-lilac`.
- **Shadow Strategy:** default cards may use the ambient shadow; soft cards do not.
- **Border:** use the shared `line` token. Avoid colored side stripes as the primary status mechanism.
- **Internal Padding:** default cards use `24px`; soft cards use `16px`.

### Inputs / Fields

- **Style:** white surface, shared line border, `12px` radius, `12px` padding, `14px` input text.
- **Focus:** border moves to trust indigo and the global visible focus outline remains available for keyboard users.
- **Error / Disabled:** error text uses `error-text`; disabled states must keep labels readable and not rely on opacity alone.

### Navigation

- **Style:** persistent product navigation with clear active state, readable labels, and compact icon support where space is limited.
- **Mobile Treatment:** customer mobile layouts stack by default and use visible navigation affordances with 44px minimum touch targets.
- **Admin Treatment:** admin navigation may be denser, but active queue, review state, and destructive actions must be visually distinct.

### Status And Consent Controls

Consent, media moderation, verification, and booking state are signature components. They must show the current state, the actor who can act next, and the safe next action. Customer-facing UI should say "share", "stop sharing", "waiting for review", "approved", or "rejected", not internal workflow terms.

## 6. Do's and Don'ts

### Do:

- **Do** use `@illamhelp/ui-tokens` as the source of truth for web and mobile colors, spacing, typography, and radii.
- **Do** target WCAG 2.2 AA: 4.5:1 contrast for body text, visible focus states, semantic controls, and 44px mobile touch targets.
- **Do** keep customer copy practical and human: jobs, bookings, contact details, photo review, verification, and sharing.
- **Do** make trust state inspectable: verification, media approval, consent, and booking progress should never be hidden behind generic labels.
- **Do** use one-column web layouts under 720px and stacked mobile layouts by default.

### Don't:

- **Don't** expose implementation terms in customer-facing web or mobile UI: grant, token, claim, policy engine, Keycloak, OPA, resource policy, internal event, or JWT.
- **Don't** use flashy gig-marketplace patterns that overpromise speed while hiding safety and verification details.
- **Don't** use dark technical admin-console styling on customer pages.
- **Don't** use over-decorated trust badges as a replacement for real verification status.
- **Don't** make ordinary flows modal-heavy when the action can happen inline or through progressive disclosure.
- **Don't** ship empty states that only say nothing is available. Always offer the next useful action.
- **Don't** rely on color alone for pending, approved, rejected, warning, error, consent, or booking state.

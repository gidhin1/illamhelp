# UI Standard

Single implementation standard for IllamHelp customer web and mobile clients.

This standard uses `PRODUCT.md` for product intent and `DESIGN.md` for the existing visual identity. When older design guidance conflicts with this document, this document is stricter for customer-facing web and mobile UI. The goal is a calm service-desk product interface: trusted, clear, practical, readable, and free of generic AI-generated UI patterns.

## Product Direction

IllamHelp helps households and service providers complete practical tasks: describe a job, find suitable people or work, share contact details, verify profiles, review photos, manage bookings, and recover from mistakes.

Customer-facing UI must:

- Use household-service language, not implementation language.
- Make trust inspectable through verification, media review, sharing access, and booking status.
- Put the next safe action in reach, especially on mobile.
- Preserve user control over contact details and visibility.
- Meet WCAG 2.2 AA for contrast, keyboard access, focus states, labels, errors, and touch targets.

Customer-facing UI must not expose these terms: `grant`, `token`, `claim`, `policy engine`, `Keycloak`, `OPA`, `resource policy`, `internal event`, or `JWT`.

Preferred wording:

- Use "share contact details", not "grant consent".
- Use "stop sharing", not "revoke grant".
- Use "request access", not "create access request policy".
- Use "review photo", "verify profile", "apply for job", and "cancel booking".

## Design Tokens

Source of truth:

- Package: `@illamhelp/ui-tokens`
- Web: `@illamhelp/ui-tokens/web.css`
- Mobile: `@illamhelp/ui-tokens/tokens.json`

### Colors

- Background: `bg`
- Alternate background: `bgAlt` / `bg-2`
- Surface: `surface`, `surfaceAlt` / `surface-2`
- Hover surface: `surfaceHover` / `surface-hover`
- Text: `ink`, `muted`
- Brand: `brand`, `brandAlt` / `brand-2`
- Accent: `accent`
- Line: `line`
- Status: `success`, `successText`, `error`, `errorText`, `warning`, `warningText`

Use the existing lilac, plum, and indigo identity from `DESIGN.md`. Do not introduce a new palette without a separate design decision.

Indigo is reserved for primary actions, active navigation, focus, selected controls, and meaningful state. It is not a decoration color.

### Spacing

- `xs` 4
- `sm` 8
- `md` 12
- `lg` 16
- `xl` 24
- `xxl` 32
- `3xl` 48
- `4xl` 64

Use the 4/8/12/16/24/32 scale. Avoid one-off spacing unless a native platform component requires it.

### Radius

- `sm` 8
- `md` 12
- `lg` 18
- `xl` 24
- `pill` 999

Stricter usage:

- Buttons: `md`.
- Inputs: `md`.
- Repeated cards and list rows: `sm` or `md`.
- Modals and large single-purpose panels: `md` or `lg`.
- Chips/tags only: `pill`.
- Avoid `lg` and `xl` on repeated cards, bottom tabs, drawers, table containers, inputs, and controls.

`pill` remains valid for compact chips, tags, and segmented-control options. It is not the default button shape.

### Typography

- `xs` 12
- `sm` 14
- `md` 16
- `lg` 18
- `xl` 22
- `2xl` 28
- `3xl` 36

Use the families and sizes already defined in `DESIGN.md`. Product screens use fixed sizes, not fluid hero typography.

Rules:

- Use weights 400, 600, and 700 only.
- Do not use `font-extrabold`, `font-black`, `fontWeight: "800"`, or `fontWeight: "900"`.
- Do not use all-caps tracked labels as decoration.
- Letter spacing stays `0` for normal text. Short functional labels may use a small native/default tracking only when necessary.
- Do not add marketing-scale headlines inside authenticated task flows.

## Component Standards

### Buttons

- Variants: `primary`, `secondary`, `ghost`, and `danger` when destructive action is required.
- Radius: `md`.
- Padding: `md` vertical, `xl` horizontal on web; platform-equivalent padding on mobile.
- Primary: solid `brand` with white text. Avoid decorative gradients for product controls.
- Secondary: `surfaceAlt` with `ink` text and `line` border.
- Ghost: transparent with visible hover/pressed state.
- States: default, hover/pressed, focus, active, disabled, and loading.
- Button labels use verb plus object: "Post job", "Apply for job", "Save profile", "Stop sharing".

### Cards and Containers

- Variants: `default`, `soft`.
- Repeated cards/list rows: radius `sm` or `md`, `line` border, no decorative shadow.
- Large single-purpose panels: radius `md` or `lg`.
- Dense tables, queues, feeds, drawers, and bottom tabs use borders and tonal backgrounds before shadows.
- Do not nest cards inside cards unless the inner surface is an actual repeated item with a distinct action.
- Do not use colored side-stripe borders for status, cards, alerts, verification items, or callouts.

### Chips and Status Labels

- Chips use `pill` radius and compact padding.
- Use chips for categories, filters, small counts, and compact metadata.
- Do not use chips as the default shape for buttons, nav items, or whole list rows.
- Status labels must include readable text and cannot rely on color alone.
- Status colors must pair with meaning: pending, approved, rejected, warning, error, success, or info.

### Inputs and Forms

- Radius: `md`.
- Border: `line`.
- Background: `surface` or `surfaceAlt` depending on density.
- Labels are always visible above controls. Do not use floating labels.
- Placeholder text must meet contrast requirements.
- Errors include what happened and how to fix it.
- Disabled fields must remain readable and must not rely on opacity alone.

### Navigation

- Web uses a normal product shell: persistent navigation, readable labels, clear active state, and simple borders.
- Desktop side navigation should be 240-260px when expanded, with solid surface and border-right.
- Mobile uses platform navigation patterns and standard bottom tabs. Do not build floating pill-shaped bottom navigation.
- Active state uses color, text, and/or background. Do not rely on color alone.
- Navigation icons must come from a real icon source. Do not use emoji or Unicode symbols as UI icons.

### Tables, Lists, and Feeds

- Lists with 5 or more items need search, filters, tabs, or another narrowing control.
- Rows include useful metadata: service, location, date, status, actor, or next action.
- Use left-aligned text and predictable row height.
- Avoid decorative metric-card grids as the default dashboard pattern.
- Avoid fake charts or visual filler that does not answer a user question.

### Loading, Empty, Error, and Success States

- Loading uses skeletons or structured placeholders where content shape is known.
- Avoid standalone "Loading..." as the only loading UI except for small inline actions.
- Empty states explain what is missing and provide the next useful action.
- Error states explain what failed and provide recovery when possible.
- Success states confirm the completed action in plain language.
- Loading and disabled states must be accessible and readable.

## Platform Standards

### Web

- Use semantic HTML controls and visible `:focus-visible` states.
- Keep authenticated pages task-first. Do not put hero sections inside dashboards, jobs, profile, consent, verification, or notifications.
- Avoid decorative cards that explain what the interface does.
- Use responsive lists/tables and a one-column layout under 720px.
- Use `lucide-react` or the approved project icon source for icons. Do not use emoji icons.
- Motion is limited to 100-200ms color, opacity, and state transitions. Respect reduced motion.

### Mobile

- Use React Navigation patterns for screen and tab navigation.
- Bottom tabs are standard, attached to the bottom, and not floating pills.
- Touch targets must be at least 44 by 44.
- Use platform-aware styling where behavior differs between iOS and Android.
- Each screen must handle loading, content, empty, and error states.
- Use vector/platform icons. Do not use emoji or Unicode symbols as UI icons.
- Avoid over-rounded cards, heavy shadows, uppercase labels, and hero-style headers in task screens.

## Interaction Patterns

- Mutual approval happens before contact details are shared.
- Sharing access is always visible, explicit, and reversible.
- Media upload shows review status in customer language: waiting for review, approved, rejected, or needs changes.
- Verification state shows the current state, what is being reviewed, and what the user can do next.
- Ordinary actions should happen inline or through progressive disclosure before using a modal.
- Destructive actions require clear labels and a confirmation when the result is hard to undo.

## Banned Patterns

Do not ship customer-facing UI with these patterns:

- `font-extrabold`, `font-black`, `fontWeight: "800"`, or `fontWeight: "900"`.
- Gradient text.
- Decorative gradients on buttons, cards, headers, avatars, or brand marks.
- Glassmorphism, frosted panels, blurred decorative shells, or glow effects.
- Colored side-stripe borders wider than 1px on cards, alerts, callouts, status rows, or verification items.
- Ghost-card styling: decorative `1px` border plus wide soft shadow on the same repeated surface.
- Shadows above an 8px blur on repeated cards, drawers, bottom tabs, list rows, or buttons.
- Card radii above 16px on repeated cards, rows, controls, drawers, and tabs.
- Pill-shaped buttons as the default.
- Emoji or Unicode characters as UI icons.
- Dashboard hero sections, social-feed hero copy, fake metric grids, decorative trust badges, or mini-note cards that explain the UI.
- Decorative uppercase tracked labels.
- Same-sized card grids repeated as the default answer to every screen.
- Customer-facing technical terms listed in Product Direction.

## Acceptance Checklist

Before shipping web or mobile UI, verify:

- Customer copy uses household-service language.
- No banned technical terms appear in customer-facing UI.
- Body text contrast is at least 4.5:1.
- Focus states are visible on web.
- Mobile touch targets are at least 44 by 44.
- Loading, empty, error, disabled, and success states are present.
- Status is communicated with text, not color alone.
- Buttons use `md` radius and clear verb-object labels.
- `pill` is used only for compact chips/tags or segmented choices.
- Repeated cards and rows use `sm` or `md` radius and no decorative shadow.
- Existing `lg` and `xl` radii are not used on repeated cards or controls.
- Brand gradients are not used for product controls.
- Icons come from approved icon libraries, not emoji or Unicode symbols.

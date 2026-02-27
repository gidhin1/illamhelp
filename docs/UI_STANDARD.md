# UI Standard

Single visual language for web and mobile clients.

## Design Tokens (source of truth)

- Package: `@illamhelp/ui-tokens`
- Web: `@illamhelp/ui-tokens/web.css`
- Mobile: `@illamhelp/ui-tokens/tokens.json`

### Colors

- Background: `bg`
- Surface: `surface`, `surfaceAlt`
- Text: `ink`, `muted`
- Brand: `brand`, `brandAlt`
- Accent: `accent`
- Line: `line`

### Spacing

- `xs` 4
- `sm` 8
- `md` 12
- `lg` 16
- `xl` 24
- `xxl` 32
- `3xl` 48
- `4xl` 64

### Radius

- `sm` 8
- `md` 12
- `lg` 18
- `xl` 24
- `pill` 999

### Typography

- `xs` 12
- `sm` 14
- `md` 16
- `lg` 18
- `xl` 22
- `2xl` 28
- `3xl` 36

## Component Standards

### Button

- Variants: `primary`, `secondary`, `ghost`
- Radius: `md`
- Padding: `md` vertical, `xl` horizontal
- States: default, hover/pressed, disabled

### Card

- Variants: `default`, `soft`
- Radius: `lg`
- Border: `line`
- Shadow: only `default` (no shadow for `soft`)

### Chip / Pill

- Radius: `pill`
- Padding: `sm` vertical, `lg` horizontal
- Used for category, status, or small emphasis

### Input

- Radius: `md`
- Border: `line`
- Placeholder uses `muted`

### Status Colors

- Pending: `accent`
- Approved: `brand`
- Rejected: `muted`

## Interaction Patterns

- Mutual approval flow before any consent requests
- Consent grant/revoke always visible and explicit
- Media upload shows moderation state (quarantine -> approved/rejected)

## Responsiveness

- Web uses 1-column layout under 720px
- Mobile uses stacked layouts by default

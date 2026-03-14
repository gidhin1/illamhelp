---
description: Design system rules and conventions for IllamHelp UI development
---

# Design System Rules

Rules and conventions that MUST be followed when building or modifying any UI in the IllamHelp project.

## Color & Tokens

1. **Never hardcode colors**. Always use tokens from `@illamhelp/ui-tokens`:
   - Web: use CSS variables (`var(--brand)`, `var(--surface)`, etc.)
   - Mobile: import from `./src/theme.ts` which reads `@illamhelp/ui-tokens/tokens.json`

2. **Primary brand color**: `#6A5ACD` (Slate Blue). All brand-related colors derive from this.

3. **Dark mode support**: Both web and mobile must support light and dark color schemes.
   - Web: Uses `prefers-color-scheme` media query + optional manual toggle
   - Mobile: Uses `useColorScheme()` hook from React Native

4. **Semantic tokens**: Use semantic names (`success`, `error`, `warning`) not raw hex values.

## Typography

- **Body font**: Inter (web), system default (mobile)
- **Display font**: Space Grotesk (web)
- Use the typography scale from tokens: `xs` through `3xl`
- Never use raw pixel values for font sizes in components

## Components

### Buttons
- Three variants: `primary`, `secondary`, `ghost`
- Primary uses brand gradient: `linear-gradient(145deg, #6A5ACD, #5548A8)`
- Always include `data-testid` for interactive buttons
- Always show loading state during async operations

### Data Tables (Admin & Web)
- Use `@tanstack/react-table` for all tabular data
- Add `@tanstack/react-virtual` when rows exceed 100
- Required features: sorting, filtering, pagination
- Sticky headers enabled by default
- Rows must have hover state using `surfaceHover` token
- All tables must be horizontally scrollable on mobile

### Cards
- Two variants: `default` (elevated), `soft` (flat)
- Use `surface` color for default, `surfaceAlt` for soft
- Cards are used for forms, summaries, and detail panels — NOT for list data (use tables)

### Feed Cards (Home Page)
- Stack vertically in main content area
- Include: avatar, author name, timestamp, content, action bar
- Support rich content (text, images, job details)

### Navigation
- **Desktop web**: Fixed left sidebar with vertical nav links
- **Mobile web**: Bottom tab bar with 5 tabs max
- **Mobile app**: Bottom tabs via `@react-navigation/bottom-tabs`
- Active tab uses `brand` color, inactive uses `muted`

## Responsive Design

### Breakpoints
| Name | Width | Layout |
|------|-------|--------|
| `xs` | <480px | Single column, bottom nav, stacked |
| `sm` | 480-767px | Single column with wider cards |
| `md` | 768-1023px | Two columns, collapsed sidebar |
| `lg` | 1024-1279px | Three columns, full sidebar |
| `xl` | ≥1280px | Three columns, spacious |

### Rules
- Mobile-first CSS (base styles = mobile, add via `min-width` media queries)
- Tables must scroll horizontally on `xs`/`sm` breakpoints
- Navigation collapses from sidebar → icon bar → bottom tabs
- Touch targets minimum 44×44px on mobile

## Accessibility

- All interactive elements must have `data-testid` attributes
- Color contrast must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)
- Focus indicators use `brand` color with 2px outline
- Form fields must have associated labels
- Status messages use appropriate ARIA roles (`alert`, `status`)

## Performance (Millions of Users)

- Use virtualization (`@tanstack/react-virtual`) for lists >100 items
- Lazy load images and heavy content below the fold
- Paginate API responses (default: 50 items, max: 200)
- Use `React.memo` for list item components
- Avoid inline style objects in render (extract to `StyleSheet.create` on mobile, CSS classes on web)

## File Organization

### Web & Admin
- Pages: `src/app/[route]/page.tsx`
- Components: `src/components/ui/` for design system, `src/components/` for app-specific
- Styles: `src/app/globals.css` (imports tokens)

### Mobile
- Screens: `src/screens/[ScreenName]Screen.tsx`
- Components: `src/components/[ComponentName].tsx`
- Navigation: `src/navigation/`
- Theme: `src/theme.ts`
- API: `src/api.ts`

---
description: Step-by-step workflow for executing the IllamHelp UI revamp
---

# UI Revamp Workflow

## Prerequisites
- Backend running: `make backend-start`
- All deps installed: `make deps`

## Phase 1 — Design Foundation
// turbo
1. Update `packages/ui-tokens/tokens.json` with new #6A5ACD purple-blue palette (light + dark)
// turbo
2. Update `packages/ui-tokens/web.css` with new CSS custom properties
// turbo
3. Update `mobile/src/theme.ts` to consume new token structure
// turbo
4. Verify tokens are valid JSON: `cat packages/ui-tokens/tokens.json | jq .`

## Phase 2 — Install Dependencies
5. Install web/admin deps: `cd web && pnpm add @tanstack/react-table @tanstack/react-virtual`
6. Install admin deps: `cd admin && pnpm add @tanstack/react-table @tanstack/react-virtual`
7. Install mobile navigation: `cd mobile && pnpm add @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context`

## Phase 3 — Web App
8. Rebuild `web/src/app/globals.css` with new theme
9. Replace fonts in `web/src/app/layout.tsx` (Inter + Space Grotesk)
10. Redesign NavBar to responsive sidebar pattern
11. Build DataTable component in `web/src/components/ui/DataTable.tsx`
12. Redesign each page (home, jobs, connections, consent, verification, profile, notifications)
// turbo
13. Verify build: `pnpm --filter @illamhelp/web build`

## Phase 4 — Admin App
14. Rebuild `admin/src/app/globals.css` with new theme
15. Build admin DataTable in `admin/src/components/ui/DataTable.tsx`
16. Migrate all admin pages to tabular layouts
// turbo
17. Verify build: `pnpm --filter @illamhelp/admin build`

## Phase 5 — Mobile App
18. Split `App.tsx` into screen files under `mobile/src/screens/`
19. Set up React Navigation in new entry point
20. Apply new theme to all screens
// turbo
21. Verify typecheck: `pnpm --filter @illamhelp/mobile typecheck`

## Phase 6 — Verification
22. Run web E2E: `make ui-test-web`
23. Run admin E2E: `make ui-test-admin`
24. Visual QA with browser tool at all breakpoints

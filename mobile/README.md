# Mobile App

React Native + Expo mobile application for IllamHelp.

## Tech Stack

- **Framework**: React Native + Expo (managed workflow)
- **Navigation**: `@react-navigation/native` + `@react-navigation/bottom-tabs`
- **Styling**: `StyleSheet.create` with theme tokens from `@illamhelp/ui-tokens`
- **Theme**: Purple-Blue brand (`#6A5ACD`)

## Project Structure

```
mobile/
├── App.tsx                    # Root: auth gate + React Navigation tabs
├── src/
│   ├── api.ts                # API client functions
│   ├── theme.ts              # Design tokens consumed from ui-tokens
│   ├── styles.ts             # Extracted StyleSheet definitions
│   ├── components.tsx         # Shared components (Button, TabBar, Banner, etc.)
│   ├── constants.ts          # App constants and labels
│   ├── utils.ts              # Utility functions
│   └── screens/
│       ├── AuthScreen.tsx     # Login / Register
│       ├── HomeScreen.tsx     # Activity feed with KPIs + job list
│       ├── JobsScreen.tsx     # Job board (create, apply, manage)
│       ├── ConnectionsScreen.tsx  # People search + connections
│       ├── ConsentScreen.tsx  # Privacy controls
│       ├── NotificationsScreen.tsx  # Alerts feed
│       ├── ProfileScreen.tsx  # Profile management
│       └── VerificationScreen.tsx   # Identity verification
```

## Start

```bash
make dev-mobile
```

### Platform-Specific

```bash
make dev-mobile-android    # Android emulator
make dev-mobile-ios        # iOS simulator
```

### API Base URL

- iOS simulator: `http://localhost:4000/api/v1`
- Android emulator: `http://10.0.2.2:4000/api/v1`

Override for LAN/device:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:4000/api/v1 make dev-mobile
```

### Cache Reset

```bash
make dev-mobile-clear     # Clear Metro cache
make dev-mobile-reset     # Full Expo state + cache reset
```

## Typecheck

```bash
pnpm --filter @illamhelp/mobile typecheck
```

## Lint

```bash
pnpm --filter @illamhelp/mobile lint
```

## Tests

Fast unit tests run with Vitest:

```bash
pnpm --filter @illamhelp/mobile test
```

Fast UI E2E automation uses **Playwright against Expo Web** with a phone viewport:

```bash
make ui-test-mobile
```

This runs the actual mobile React Native screens through `react-native-web`, using the same
UI-only rules as the web/admin Playwright suites. It avoids native build and emulator startup
cost for day-to-day regression coverage. Use short manual simulator/device smoke checks before
release for platform-only behavior such as permissions and native keyboard/layout details.

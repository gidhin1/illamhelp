# Mobile App

React Native + Expo mobile application for IllamHelp.

## Tech Stack

- **Framework**: React Native + Expo (managed workflow)
- **Navigation**: `@react-navigation/native` + `@react-navigation/bottom-tabs`
- **Styling**: React Native Paper with shared `@illamhelp/ui-tokens` and layout styles
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

## Native build compatibility

Use the versions supported by Expo SDK 53 and React Native 0.79. The Metro
configuration resolves React from this app so workspace packages load the
same React version as React Native. Regenerate the local iOS and Android
projects after dependency upgrades.

`plugins/withFmtAppleClangFix.js` persists an iOS fmt 11 compatibility change
through Expo prebuild. Apple Clang 21+ otherwise fails to compile this React
Native dependency's consteval formatting code. The Podfile hook is idempotent
and fails if the expected header changes, requiring review instead of silently
patching an unknown version. See [the upstream report](https://github.com/fmtlib/fmt/issues/4740).
The same Podfile hook gives the SVG filters resource bundle the app's minimum
iOS version. The separate UIKit scene plugin binds the React Native window to
its scene on iOS, including iOS 27.

For native release checks, including staging sign-in and physical-device
coverage, see the [UI standard](../docs/UI_STANDARD.md#release-validation).

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

Use the Android debug build (`make dev-mobile-android`) with the local HTTP
API. For Android release builds, set the HTTPS API and media proxy URLs before
bundling. Expo embeds these public values in the bundle.

For a 16 KB release check, regenerate the Android project with Expo prebuild
and build both artifacts with `:app:assembleRelease :app:bundleRelease`.
Run `zipalign -c -P 16 -v 4` on the release APK, check the load segments of
the packaged arm64-v8a and x86_64 libraries, and check for
`PAGE_ALIGNMENT_16K` in `bundletool dump config` for the AAB. The local
build needed 5 GB of Gradle heap to collect release dependency metadata.
[Android 16 KB verification guide](https://developer.android.com/guide/practices/page-sizes).

Override for LAN/device in development:

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

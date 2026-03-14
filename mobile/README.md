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

## E2E Tests (Maestro)

From repo root:

```bash
make mobile-native-init            # Initialize native projects (first time)
make ui-test-mobile-ios            # iOS simulator
make ui-test-mobile-android        # Android emulator
make ui-test-mobile                # Both platforms
```

### Debug Mode

```bash
make ui-test-mobile-ios-debug
make ui-test-mobile-android-debug

# Single flow
MAESTRO_FLOW=.maestro/flows/auth.yaml make ui-test-mobile-ios-debug
```

### Defaults

- iOS device: `iPhone 16e` (override: `MAESTRO_IOS_DEVICE`)
- Android AVD: `Pixel_9` (override: `MAESTRO_ANDROID_AVD`)

### Artifacts

- iOS: `mobile/artifacts/maestro/ios`
- Android: `mobile/artifacts/maestro/android`
- Debug logs: `mobile/artifacts/maestro/debug-*`

### Notes

- Maestro runs against native simulator/emulator builds, not Expo Go
- First run is slower because it builds the native app; later runs reuse the built app by default
- Force a rebuild only when needed:
  `MAESTRO_FORCE_BUILD=true MAESTRO_CLEAN_BUILD=true make ui-test-mobile-ios`
- Install the mobile testing Maestro CLI locally before running the suite:
  `curl -Ls "https://get.maestro.mobile.dev" | bash`
- If needed, add it to your shell path:
  `export PATH="$HOME/.maestro/bin:$PATH"`
- `brew install maestro` installs the unrelated desktop app cask, not the mobile test CLI
- Ensure Xcode, CocoaPods, and Android Studio emulators are installed before running Maestro

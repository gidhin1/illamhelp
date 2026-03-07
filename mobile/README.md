# Mobile App

React Native + Expo app for IllamHelp.

## Start

```bash
make deps
make dev-mobile
```

## API Base URL

- iOS simulator: `http://localhost:4000/api/v1`
- Android emulator: `http://10.0.2.2:4000/api/v1`

Override:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:4000/api/v1 make dev-mobile
```

## Detox E2E

From repo root:

```bash
make mobile-native-init
make ui-test-mobile-ios
make ui-test-mobile-android
make ui-test-mobile
```

Debug:

```bash
make ui-test-mobile-ios-debug
make ui-test-mobile-android-debug
DETOX_TEST_NAME_PATTERN="register lands on home and sign out returns to auth" make ui-test-mobile-ios-debug
DETOX_TEST_NAME_PATTERN="register lands on home and sign out returns to auth" make ui-test-mobile-android-debug
```

Artifacts:

- iOS: `/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/debug-ios`
- Android: `/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/debug-android`

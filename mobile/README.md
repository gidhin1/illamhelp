# Mobile App

React Native + Expo app for IllamHelp (Android + iOS) with full backend flow:

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /profiles/me`, `PATCH /profiles/me`, `GET /profiles/:userId`
- `GET/POST /jobs`
- `GET /connections`, `POST /connections/request`, `POST /connections/:id/accept`, `POST /connections/:id/decline`, `POST /connections/:id/block`
- Consent workflow (`request-access`, `grant`, `revoke`, `can-view`)

## Start

```bash
make deps
make dev-mobile
```

## API Base URL

By default:

- iOS simulator: `http://localhost:4000/api/v1`
- Android emulator: `http://10.0.2.2:4000/api/v1`

Override for real devices or custom hosts:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:4000/api/v1 make dev-mobile
```

## Troubleshooting

```bash
make dev-mobile-clear
make dev-mobile-reset
make dev-mobile-android
make dev-mobile-ios
```

## Notes

- Media moderation policy is shown in UI; media upload/download endpoints are not yet exposed by backend.

## Detox Native UI E2E

From repo root:

```bash
make mobile-native-init
make ui-test-mobile-ios
make ui-test-mobile-android
make ui-test-mobile
```

Detox iOS speed modes:

- Fast local default (reuses app instance between tests, reloads React Native):
  `make ui-test-mobile-ios`
- Strict isolation (new app instance per test, slower but highest isolation):
  `DETOX_NEW_INSTANCE_PER_TEST=true DETOX_RELOAD_REACT_NATIVE=false make ui-test-mobile-ios`
- Default speed profile now uses:
  `DETOX_POLL_INTERVAL_MS=450`, `DETOX_TYPE_RETRIES=1`, `DETOX_VERIFY_TYPED_INPUT=false`
  and `DETOX_HANDLE_IOS_PASSWORD_PROMPTS=true` on iOS (`false` on Android)
- Optional backend polling override (lower can be faster but less stable on slow machines):
  `DETOX_POLL_INTERVAL_MS=350 make ui-test-mobile-ios`
- Optional iOS password-sheet probe tune:
  `DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS=60 make ui-test-mobile-ios`
- If iOS Save Password sheet appears in your simulator, enable explicit handling:
  `DETOX_HANDLE_IOS_PASSWORD_PROMPTS=true make ui-test-mobile-ios`

Detox Android speed modes:

- Fast local default:
  `make ui-test-mobile-android`
- Strict isolation:
  `DETOX_NEW_INSTANCE_PER_TEST=true DETOX_RELOAD_REACT_NATIVE=false make ui-test-mobile-android`
- Default speed profile now uses:
  `DETOX_POLL_INTERVAL_MS=450`, `DETOX_TYPE_RETRIES=1`, `DETOX_VERIFY_TYPED_INPUT=false`
- Android log capture defaults to failure-only (`DETOX_ANDROID_CAPTURE_LOGS=on_fail`) for speed.
  Force full logs on successful runs with:
  `DETOX_ANDROID_CAPTURE_LOGS=always make ui-test-mobile-android`

This suite runs against native iOS Simulator and Android Emulator builds.
Android Detox uses the release APK by default, so Metro is not required.
If you intentionally run Android debug build, keep Metro running (`make dev-mobile`) or you'll get `Unable to load script`.
If Android Detox startup fails, inspect `/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-logcat.log`.
App-focused logs are also exported:
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-app.log`,
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-crash.log`,
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-anr.log`.

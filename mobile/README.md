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

This suite runs against native iOS Simulator and Android Emulator builds.
Android Detox uses the release APK by default, so Metro is not required.
If you intentionally run Android debug build, keep Metro running (`make dev-mobile`) or you'll get `Unable to load script`.
If Android Detox startup fails, inspect `/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-logcat.log`.
App-focused logs are also exported:
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-app.log`,
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-crash.log`,
`/Users/gidhin1/Documents/claude_proj/illamhelp/mobile/artifacts/detox/android-anr.log`.

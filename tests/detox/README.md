# Detox Mobile E2E

Native mobile end-to-end tests for the Expo app using Detox on iOS Simulator and Android Emulator.

## Flows covered

- Register / Login
- Jobs create
- Connection request + accept
- Consent request + grant + revoke + can-view checks

## Commands

From repo root:

```bash
make mobile-native-init
make ui-test-mobile-ios
make ui-test-mobile-android
make ui-test-mobile
```

## Prerequisites

- Xcode + iOS Simulator installed.
- CocoaPods installed (`pod` must be available on PATH).
- `applesimutils` installed (`brew tap wix/brew && brew install applesimutils`).
- Android Studio with an emulator (AVD) available.
- Java 17 or 21 available for Android Gradle builds.
- Android SDK available and discoverable (`ANDROID_HOME`/`ANDROID_SDK_ROOT`) or at `~/Library/Android/sdk`.
- `pnpm install` run after pulling dependency changes.

Android Detox scripts auto-detect SDK location and export `ANDROID_SDK_ROOT` for both build and test phases.
Android Detox defaults to `release` APK build type (bundled JS, no Metro required). Override with `DETOX_ANDROID_BUILD_TYPE=debug` only if you intentionally run Metro.

## iOS framework cache recovery

If Detox iOS fails with missing `Detox.framework`, run:

```bash
cd mobile
pnpm exec detox clean-framework-cache
pnpm exec detox build-framework-cache
```

## Device overrides

- `DETOX_IOS_DEVICE` (default: `iPhone 16e`)
- `DETOX_IOS_SCHEME` (optional explicit scheme for xcodebuild)
- `DETOX_ANDROID_AVD` (default: `Pixel_9`)
- `E2E_API_BASE_URL` (default: `http://localhost:4000/api/v1`)

# Maestro Mobile E2E

This folder contains the native mobile UI E2E suite for IllamHelp.

## Principles

- UI-only flows
- Native app builds, not Expo Go
- Reuse existing `testID` coverage
- Small feature flows instead of one monolithic suite
- Admin review coverage stays in Playwright admin

## Run

From the repo root:

```bash
make mobile-native-init
make ui-test-mobile-ios
make ui-test-mobile-android
make ui-test-mobile
```

Single flow examples:

```bash
MAESTRO_FLOW=.maestro/flows/auth.yaml make ui-test-mobile-ios-debug
MAESTRO_FLOW=.maestro/flows/jobs-discover-posted-assigned.yaml make ui-test-mobile-android-debug
```

## Notes

- iOS default simulator: `iPhone 16e`
- Android default AVD: `Pixel_9`
- The run scripts generate fresh user credentials per run and export them as environment variables for Maestro flows.

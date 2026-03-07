# Detox Mobile E2E

Native mobile E2E tests for the Expo app (iOS Simulator + Android Emulator).

## Commands

```bash
make mobile-native-init
make ui-test-mobile-ios
make ui-test-mobile-android
make ui-test-mobile
make ui-test-mobile-ios-debug
make ui-test-mobile-android-debug
```

Single test:

```bash
DETOX_TEST_NAME_PATTERN="register lands on home and sign out returns to auth" make ui-test-mobile-ios-debug
DETOX_TEST_NAME_PATTERN="register lands on home and sign out returns to auth" make ui-test-mobile-android-debug
```

## Defaults

- iOS device: `iPhone 16e` (`DETOX_IOS_DEVICE`)
- Android AVD: `Pixel_9` (`DETOX_ANDROID_AVD`)
- API: `http://localhost:4000/api/v1` (`E2E_API_BASE_URL`)

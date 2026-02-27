/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "e2e/jest.config.js"
    },
    jest: {
      setupTimeout: 180000
    }
  },
  apps: {
    "ios.release": {
      type: "ios.app",
      binaryPath: "ios/build/DetoxApp.app",
      build: "DETOX_IOS_BUILD_CONFIGURATION=Release bash ./scripts/detox-build-ios.sh"
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/release/app-release.apk",
      testBinaryPath: "android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk",
      build: "DETOX_ANDROID_BUILD_TYPE=release bash ./scripts/detox-build-android.sh"
    },
    "android.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/debug/app-debug.apk",
      testBinaryPath: "android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
      build: "DETOX_ANDROID_BUILD_TYPE=debug bash ./scripts/detox-build-android.sh"
    }
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: process.env.DETOX_IOS_DEVICE ?? "iPhone 16e"
      }
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: process.env.DETOX_ANDROID_AVD ?? "Pixel_9"
      }
    }
  },
  configurations: {
    "ios.sim.release": {
      device: "simulator",
      app: "ios.release"
    },
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.release"
    },
    "android.emu.release": {
      device: "emulator",
      app: "android.release"
    },
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug"
    }
  }
};

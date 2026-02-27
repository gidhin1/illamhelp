#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

find_android_sdk_dir() {
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME:-}" ]]; then
    echo "$ANDROID_HOME"
    return 0
  fi

  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT:-}" ]]; then
    echo "$ANDROID_SDK_ROOT"
    return 0
  fi

  if [[ -f android/local.properties ]]; then
    local sdk_from_props
    sdk_from_props="$(sed -n 's/^sdk\.dir=//p' android/local.properties | head -n1 || true)"
    if [[ -n "$sdk_from_props" && -d "$sdk_from_props" ]]; then
      echo "$sdk_from_props"
      return 0
    fi
  fi

  local candidates=(
    "$HOME/Library/Android/sdk"
    "$HOME/Android/Sdk"
    "/usr/local/share/android-sdk"
    "/opt/android-sdk"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

sdk_dir="$(find_android_sdk_dir || true)"
if [[ -z "$sdk_dir" ]]; then
  echo "ANDROID_SDK_ROOT/ANDROID_HOME not found."
  echo "Set ANDROID_SDK_ROOT or ANDROID_HOME, or install SDK via Android Studio."
  exit 1
fi

export ANDROID_HOME="$sdk_dir"
export ANDROID_SDK_ROOT="$sdk_dir"
export PATH="$sdk_dir/platform-tools:$sdk_dir/emulator:$PATH"

ANDROID_CONFIGURATION="${DETOX_ANDROID_CONFIGURATION:-android.emu.release}"
ANDROID_BUILD_TYPE="${DETOX_ANDROID_BUILD_TYPE:-release}"
DETOX_LOGLEVEL="${DETOX_LOGLEVEL:-info}"
APP_PACKAGE="${DETOX_ANDROID_APP_PACKAGE:-com.anonymous.illamhelp}"
LOGCAT_FILE="artifacts/detox/android-logcat.log"
APP_LOG_FILE="artifacts/detox/android-app.log"
CRASH_LOG_FILE="artifacts/detox/android-crash.log"
ANR_LOG_FILE="artifacts/detox/android-anr.log"
mkdir -p "artifacts/detox"

echo "Using Android SDK for Detox test: $sdk_dir"
echo "Using Detox Android configuration: $ANDROID_CONFIGURATION"
echo "Using Android build type: $ANDROID_BUILD_TYPE"
echo "Detox log level: $DETOX_LOGLEVEL"
echo "Android app package: $APP_PACKAGE"

if [[ "$ANDROID_BUILD_TYPE" == "debug" ]]; then
  echo "Debug Android build selected. Ensure Metro is running, otherwise app may fail with 'unable to load script'."
fi

if [[ "$ANDROID_BUILD_TYPE" == "release" ]]; then
  APP_APK="android/app/build/outputs/apk/release/app-release.apk"
  TEST_APK="android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk"
  if [[ ! -f "$APP_APK" || ! -f "$TEST_APK" ]]; then
    echo "Release Detox APKs are missing."
    echo "Run: DETOX_ANDROID_BUILD_TYPE=release pnpm --filter @illamhelp/mobile run e2e:detox:build:android"
    exit 1
  fi
fi

ADB_BIN="$sdk_dir/platform-tools/adb"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$ANDROID_SERIAL" && -x "$ADB_BIN" ]]; then
  ANDROID_SERIAL="$("$ADB_BIN" devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ { print $1; exit }')"
fi
if [[ -z "$ANDROID_SERIAL" && -x "$ADB_BIN" ]]; then
  ANDROID_SERIAL="$("$ADB_BIN" devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
fi

prepare_emulator() {
  if [[ -z "$ANDROID_SERIAL" || ! -x "$ADB_BIN" ]]; then
    return
  fi

  "$ADB_BIN" -s "$ANDROID_SERIAL" wait-for-device >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global anr_show_background 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global show_first_crash_dialog 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global show_first_crash_dialog_dev_option 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell input keyevent 82 >/dev/null 2>&1 || true
}

LOGCAT_PID=""
start_logcat() {
  if [[ -n "$ANDROID_SERIAL" && -x "$ADB_BIN" ]]; then
    : >"$LOGCAT_FILE"
    "$ADB_BIN" -s "$ANDROID_SERIAL" logcat -c >/dev/null 2>&1 || true
    "$ADB_BIN" -s "$ANDROID_SERIAL" logcat -v time >"$LOGCAT_FILE" 2>&1 &
    LOGCAT_PID=$!
    echo "Recording Android logcat to $LOGCAT_FILE (serial: $ANDROID_SERIAL)"
  else
    echo "Warning: Android emulator serial not detected. Live logcat capture disabled."
  fi
}

stop_logcat() {
  if [[ -n "$LOGCAT_PID" ]]; then
    kill "$LOGCAT_PID" >/dev/null 2>&1 || true
    wait "$LOGCAT_PID" >/dev/null 2>&1 || true
  fi
}

dump_log_artifacts() {
  if [[ ! -x "$ADB_BIN" ]]; then
    return
  fi

  if [[ -z "$ANDROID_SERIAL" ]]; then
    ANDROID_SERIAL="$("$ADB_BIN" devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
  fi

  if [[ -z "$ANDROID_SERIAL" ]]; then
    echo "No connected Android device found for log dump."
    return
  fi

  # Snapshot full device logcat so we still have logs even if live capture missed lines.
  "$ADB_BIN" -s "$ANDROID_SERIAL" logcat -d -v time >"$LOGCAT_FILE" 2>&1 || true

  # Application-focused logs (JS/native/app-package/crash/anr).
  grep -E "ReactNativeJS|AndroidRuntime|FATAL EXCEPTION| ANR |not responding|${APP_PACKAGE}" "$LOGCAT_FILE" >"$APP_LOG_FILE" || true
  grep -E "AndroidRuntime|FATAL EXCEPTION|${APP_PACKAGE}" "$LOGCAT_FILE" >"$CRASH_LOG_FILE" || true
  grep -Ei " ANR |not responding|am_anr|Process .*isn't responding" "$LOGCAT_FILE" >"$ANR_LOG_FILE" || true
}

prepare_emulator
start_logcat
set +e
pnpm exec detox test -c "$ANDROID_CONFIGURATION" --cleanup --loglevel "$DETOX_LOGLEVEL"
TEST_EXIT=$?
set -e
stop_logcat
dump_log_artifacts

if [[ $TEST_EXIT -ne 0 ]]; then
  if [[ -f "$LOGCAT_FILE" ]]; then
    echo "Detox test failed. Last 120 lines from $LOGCAT_FILE:"
    tail -n 120 "$LOGCAT_FILE" || true
  fi
  if [[ -f "$APP_LOG_FILE" ]]; then
    echo "Last 120 lines from app-focused log $APP_LOG_FILE:"
    tail -n 120 "$APP_LOG_FILE" || true
  fi
  if [[ -f "$ANR_LOG_FILE" ]]; then
    echo "Last 40 lines from ANR log $ANR_LOG_FILE:"
    tail -n 40 "$ANR_LOG_FILE" || true
  fi
  exit $TEST_EXIT
fi

echo "Android logs saved:"
echo "- $LOGCAT_FILE"
echo "- $APP_LOG_FILE"
echo "- $CRASH_LOG_FILE"
echo "- $ANR_LOG_FILE"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

find_android_sdk_dir() {
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
    echo "$ANDROID_HOME"
    return 0
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
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

  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "/usr/local/share/android-sdk" "/opt/android-sdk"; do
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

CONFIGURATION="${DETOX_ANDROID_CONFIGURATION:-android.emu.release}"
LOGLEVEL="${DETOX_LOGLEVEL:-info}"
ARTIFACTS_DIR="${DETOX_ARTIFACTS_DIR:-artifacts/detox}"
RECORD_LOGS="${DETOX_RECORD_LOGS:-on_fail}"
TAKE_SCREENSHOTS="${DETOX_TAKE_SCREENSHOTS:-none}"
RECORD_VIDEOS="${DETOX_RECORD_VIDEOS:-none}"
TEST_FILE="${DETOX_TEST_FILE:-}"
TEST_NAME_PATTERN="${DETOX_TEST_NAME_PATTERN:-}"
JEST_REPORT_SPECS="${DETOX_JEST_REPORT_SPECS:-false}"

mkdir -p "$ARTIFACTS_DIR"

ADB_BIN="$sdk_dir/platform-tools/adb"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$ANDROID_SERIAL" && -x "$ADB_BIN" ]]; then
  ANDROID_SERIAL="$($ADB_BIN devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ { print $1; exit }')"
fi
if [[ -n "$ANDROID_SERIAL" && -x "$ADB_BIN" ]]; then
  "$ADB_BIN" -s "$ANDROID_SERIAL" wait-for-device >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
  "$ADB_BIN" -s "$ANDROID_SERIAL" shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
fi

DETOX_CMD=(
  pnpm exec detox test
  -c "$CONFIGURATION"
  --cleanup
  --loglevel "$LOGLEVEL"
  --artifacts-location "$ARTIFACTS_DIR"
  --record-logs "$RECORD_LOGS"
  --take-screenshots "$TAKE_SCREENSHOTS"
  --record-videos "$RECORD_VIDEOS"
)

if [[ -n "$TEST_FILE" ]]; then
  DETOX_CMD+=("$TEST_FILE")
fi
if [[ -n "$TEST_NAME_PATTERN" ]]; then
  DETOX_CMD+=(--testNamePattern "$TEST_NAME_PATTERN")
fi
if [[ "$JEST_REPORT_SPECS" == "true" ]]; then
  DETOX_CMD+=(--jest-report-specs)
fi

"${DETOX_CMD[@]}"

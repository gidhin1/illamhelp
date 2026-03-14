#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
MAESTRO_BIN="$(bash ./scripts/maestro-check.sh)"

if [[ "${MAESTRO_SKIP_BUILD:-false}" != "true" ]]; then
  bash ./scripts/maestro-build-android.sh
fi

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
  exit 1
fi
export ANDROID_HOME="$sdk_dir"
export ANDROID_SDK_ROOT="$sdk_dir"
export PATH="$sdk_dir/platform-tools:$sdk_dir/emulator:$PATH"

FLOW_TARGET="${MAESTRO_FLOW:-.maestro/flows/suite-android.yaml}"
ARTIFACTS_DIR="${MAESTRO_ARTIFACTS_DIR:-artifacts/maestro/android}"
RUN_LOG_FILE="${MAESTRO_RUN_LOG_FILE:-${ARTIFACTS_DIR}/maestro-android.log}"
APP_ID="${MAESTRO_APP_ID:-com.anonymous.illamhelp}"
ANDROID_BUILD_TYPE="$(printf '%s' "${MAESTRO_ANDROID_BUILD_TYPE:-release}" | tr '[:upper:]' '[:lower:]')"
APK_PATH="android/app/build/outputs/apk/${ANDROID_BUILD_TYPE}/app-${ANDROID_BUILD_TYPE}.apk"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
MAESTRO_ANDROID_AVD="${MAESTRO_ANDROID_AVD:-Pixel_9}"
MAESTRO_FORCE_BUILD="${MAESTRO_FORCE_BUILD:-false}"

mkdir -p "$ARTIFACTS_DIR"
: > "$RUN_LOG_FILE"
exec > >(tee -a "$RUN_LOG_FILE") 2>&1

if [[ "${MAESTRO_SKIP_BUILD:-false}" != "true" ]]; then
  if [[ "${MAESTRO_FORCE_BUILD}" == "true" || ! -f "$APK_PATH" ]]; then
    bash ./scripts/maestro-build-android.sh
  else
    echo "Reusing existing Android APK at $APK_PATH"
  fi
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "Built Android APK not found at $APK_PATH"
  exit 1
fi

if [[ -z "$ANDROID_SERIAL" ]]; then
  ANDROID_SERIAL="$(adb devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
fi

if [[ -z "$ANDROID_SERIAL" ]]; then
  if command -v emulator >/dev/null 2>&1; then
    nohup emulator -avd "$MAESTRO_ANDROID_AVD" -no-snapshot-save -netdelay none -netspeed full >"${ARTIFACTS_DIR}/emulator.log" 2>&1 &
    adb wait-for-device
    until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
      sleep 2
    done
    ANDROID_SERIAL="$(adb devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
  fi
fi

if [[ -z "$ANDROID_SERIAL" ]]; then
  echo "No Android device found, and the default emulator could not be started automatically."
  exit 1
fi

adb -s "$ANDROID_SERIAL" install -r "$APK_PATH"

bash ./scripts/maestro-env.sh "$MAESTRO_BIN" test --platform android --device "$ANDROID_SERIAL" "$FLOW_TARGET"

echo "Maestro Android run complete for app $APP_ID"

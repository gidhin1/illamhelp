#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="artifacts/detox"
mkdir -p "$ARTIFACTS_DIR"
ANDROID_BUILD_TYPE="$(printf '%s' "${DETOX_ANDROID_BUILD_TYPE:-release}" | tr '[:upper:]' '[:lower:]')"
ANDROID_BUILD_TYPE_CAP="$(printf '%s' "$ANDROID_BUILD_TYPE" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"

parse_java_major() {
  "$1" -version 2>&1 | awk -F\" '/version/ { v=$2; split(v,a,"."); print (a[1]=="1" ? a[2] : a[1]); exit }'
}

ensure_java_runtime() {
  local java_bin="$(command -v java || true)"
  local major=""
  if [[ -n "$java_bin" ]]; then
    major="$(parse_java_major "$java_bin" || true)"
  fi
  if [[ -n "$major" && "$major" -ge 17 && "$major" -le 21 ]]; then
    return
  fi
  if [[ -x /usr/libexec/java_home ]]; then
    for version in 21 17; do
      local candidate
      candidate="$(/usr/libexec/java_home -v "$version" 2>/dev/null || true)"
      if [[ -n "$candidate" ]]; then
        export JAVA_HOME="$candidate"
        export PATH="$JAVA_HOME/bin:$PATH"
        return
      fi
    done
  fi
  echo "Android build requires Java 17 or 21."
  exit 1
}

find_android_sdk_dir() {
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
    echo "$ANDROID_HOME"
    return 0
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
    echo "$ANDROID_SDK_ROOT"
    return 0
  fi
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "/usr/local/share/android-sdk" "/opt/android-sdk"; do
    if [[ -d "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ ! -f android/app/build.gradle || ! -f android/app/src/main/AndroidManifest.xml ]]; then
  echo "Android native project missing/incomplete. Running Expo prebuild (Android)..."
  CI=1 pnpm exec expo prebuild --platform android --clean
fi

bash ./scripts/detox-configure-android.sh
ensure_java_runtime

sdk_dir="$(find_android_sdk_dir || true)"
if [[ -z "$sdk_dir" ]]; then
  echo "Android SDK location not found. Set ANDROID_HOME or ANDROID_SDK_ROOT."
  exit 1
fi
export ANDROID_HOME="$sdk_dir"
export ANDROID_SDK_ROOT="$sdk_dir"
export PATH="$sdk_dir/platform-tools:$sdk_dir/emulator:$PATH"
printf "sdk.dir=%s\n" "$sdk_dir" > android/local.properties

chmod +x android/gradlew
BUILD_LOG="$ARTIFACTS_DIR/android-build.log"
GRADLE_TASKS=("assemble${ANDROID_BUILD_TYPE_CAP}" "assembleAndroidTest" "-DtestBuildType=${ANDROID_BUILD_TYPE}")
if [[ "${DETOX_ANDROID_DISABLE_NEW_ARCH:-true}" == "true" ]]; then
  GRADLE_TASKS+=("-PnewArchEnabled=false")
fi
if [[ "$ANDROID_BUILD_TYPE" == "release" ]]; then
  GRADLE_TASKS+=("-Pandroid.enableProguardInReleaseBuilds=false")
  GRADLE_TASKS+=("-Pandroid.enableShrinkResourcesInReleaseBuilds=false")
  GRADLE_TASKS+=("-Pandroid.enablePngCrunchInReleaseBuilds=false")
fi

if [[ "${DETOX_VERBOSE_BUILD:-false}" == "true" ]]; then
  (cd android && ./gradlew "${GRADLE_TASKS[@]}")
else
  if ! (cd android && ./gradlew "${GRADLE_TASKS[@]}" >"../$BUILD_LOG" 2>&1); then
    echo "Android Detox build failed. Last 120 lines from $BUILD_LOG:"
    tail -n 120 "$BUILD_LOG" || true
    exit 1
  fi
fi

echo "Android Detox APKs ready for build type: $ANDROID_BUILD_TYPE"

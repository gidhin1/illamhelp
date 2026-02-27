#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="artifacts/detox"
mkdir -p "$ARTIFACTS_DIR"
ANDROID_BUILD_TYPE="${DETOX_ANDROID_BUILD_TYPE:-release}"
ANDROID_BUILD_TYPE="$(printf '%s' "$ANDROID_BUILD_TYPE" | tr '[:upper:]' '[:lower:]')"
ANDROID_BUILD_TYPE_CAP="$(printf '%s' "$ANDROID_BUILD_TYPE" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
DETOX_ANDROID_DISABLE_NEW_ARCH="${DETOX_ANDROID_DISABLE_NEW_ARCH:-true}"

parse_java_major() {
  local java_bin="$1"
  "$java_bin" -version 2>&1 | awk -F\" '
    /version/ {
      v = $2
      n = split(v, a, ".")
      if (a[1] == "1") {
        print a[2]
      } else {
        print a[1]
      }
      exit
    }
  '
}

find_android_sdk_dir() {
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME:-}" ]]; then
    echo "$ANDROID_HOME"
    return 0
  fi

  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT:-}" ]]; then
    echo "$ANDROID_SDK_ROOT"
    return 0
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

ensure_android_sdk_location() {
  local sdk_dir
  sdk_dir="$(find_android_sdk_dir || true)"

  if [[ -z "$sdk_dir" ]]; then
    echo "Android SDK location not found."
    echo "Set ANDROID_HOME or ANDROID_SDK_ROOT, or install Android SDK via Android Studio."
    echo "Expected default on macOS: $HOME/Library/Android/sdk"
    exit 1
  fi

  export ANDROID_HOME="$sdk_dir"
  export ANDROID_SDK_ROOT="$sdk_dir"
  export PATH="$sdk_dir/platform-tools:$sdk_dir/emulator:$PATH"

  local local_props="android/local.properties"
  if [[ -f "$local_props" ]]; then
    local tmp
    tmp="$(mktemp)"
    awk -v sdk="$sdk_dir" '
      BEGIN { done = 0 }
      /^sdk\.dir=/ { print "sdk.dir=" sdk; done = 1; next }
      { print }
      END { if (!done) print "sdk.dir=" sdk }
    ' "$local_props" >"$tmp"
    mv "$tmp" "$local_props"
  else
    printf "sdk.dir=%s\n" "$sdk_dir" >"$local_props"
  fi

  echo "Using Android SDK: $sdk_dir"
}

ensure_android_java_runtime() {
  local current_java
  local current_major
  current_java="$(command -v java || true)"
  current_major=""
  if [[ -n "$current_java" ]]; then
    current_major="$(parse_java_major "$current_java" || true)"
  fi

  if [[ -n "$current_major" && "$current_major" -ge 17 && "$current_major" -le 21 ]]; then
    echo "Using current Java runtime (major $current_major) for Android build."
    return 0
  fi

  if [[ -x /usr/libexec/java_home ]]; then
    local candidate
    for version in 21 17; do
      candidate="$(/usr/libexec/java_home -v "$version" 2>/dev/null || true)"
      if [[ -n "$candidate" ]]; then
        export JAVA_HOME="$candidate"
        export PATH="$JAVA_HOME/bin:$PATH"
        local picked_major
        picked_major="$(parse_java_major "$JAVA_HOME/bin/java" || true)"
        echo "Switched Java runtime for Android build to JAVA_HOME=$JAVA_HOME (major $picked_major)."
        return 0
      fi
    done
  fi

  echo "Android build requires Java 17 or 21."
  if [[ -n "$current_major" ]]; then
    echo "Current Java major is $current_major (unsupported for this build)."
  else
    echo "Java runtime was not detected on PATH."
  fi
  echo "Install JDK 17 or 21 and retry."
  exit 1
}

if [[ ! -f android/app/build.gradle || ! -f android/app/src/main/AndroidManifest.xml ]]; then
  echo "Android native project missing/incomplete. Running Expo prebuild (Android)..."
  CI=1 pnpm exec expo prebuild --platform android --clean
fi

bash ./scripts/detox-configure-android.sh
ensure_android_java_runtime
ensure_android_sdk_location

chmod +x android/gradlew
BUILD_LOG="$ARTIFACTS_DIR/android-build.log"
echo "Building Android app for Detox (log: $BUILD_LOG)"
echo "Using Android build type: $ANDROID_BUILD_TYPE"
echo "Disable React Native New Architecture for Detox build: $DETOX_ANDROID_DISABLE_NEW_ARCH"

GRADLE_TASKS=( "assemble${ANDROID_BUILD_TYPE_CAP}" "assembleAndroidTest" "-DtestBuildType=${ANDROID_BUILD_TYPE}" )

if [[ "$DETOX_ANDROID_DISABLE_NEW_ARCH" == "true" ]]; then
  GRADLE_TASKS+=( "-PnewArchEnabled=false" )
fi

# Keep Detox release builds simple and deterministic.
if [[ "$ANDROID_BUILD_TYPE" == "release" ]]; then
  GRADLE_TASKS+=( "-Pandroid.enableProguardInReleaseBuilds=false" )
  GRADLE_TASKS+=( "-Pandroid.enableShrinkResourcesInReleaseBuilds=false" )
  GRADLE_TASKS+=( "-Pandroid.enablePngCrunchInReleaseBuilds=false" )
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

echo "Android Detox APKs ready:"
echo "- android/app/build/outputs/apk/${ANDROID_BUILD_TYPE}/app-${ANDROID_BUILD_TYPE}.apk"
echo "- android/app/build/outputs/apk/androidTest/${ANDROID_BUILD_TYPE}/app-${ANDROID_BUILD_TYPE}-androidTest.apk"
echo "Android build log: $BUILD_LOG"

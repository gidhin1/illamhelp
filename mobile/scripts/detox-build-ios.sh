#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="artifacts/detox"
mkdir -p "$ARTIFACTS_DIR"
IOS_BUILD_CONFIGURATION="${DETOX_IOS_BUILD_CONFIGURATION:-Release}"

NEEDS_PREBUILD=false
if [[ ! -d ios ]]; then
  NEEDS_PREBUILD=true
elif [[ -z "$(find ios -maxdepth 1 \( -name "*.xcworkspace" -o -name "*.xcodeproj" \) | head -n1)" ]]; then
  NEEDS_PREBUILD=true
elif [[ ! -f ios/Podfile ]]; then
  NEEDS_PREBUILD=true
fi

if [[ "$NEEDS_PREBUILD" == "true" ]]; then
  echo "iOS native project missing/incomplete. Running Expo prebuild (iOS)..."
  CI=1 pnpm exec expo prebuild --platform ios --clean
fi

if [[ -f ios/Podfile ]]; then
  if command -v pod >/dev/null 2>&1; then
    (cd ios && pod install)
  else
    echo "CocoaPods is required for iOS Detox build. Install with: sudo gem install cocoapods"
    exit 1
  fi
fi

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" | head -n1 || true)"
if [[ -z "$WORKSPACE" ]]; then
  echo "Could not find an iOS workspace in mobile/ios."
  exit 1
fi

WORKSPACE_BASENAME="$(basename "$WORKSPACE" .xcworkspace)"

ALL_SCHEMES_RAW="$(
  xcodebuild -workspace "$WORKSPACE" -list 2>/dev/null | awk '
    /Schemes:/ { in_schemes = 1; next }
    in_schemes && NF {
      gsub(/^[ \t]+|[ \t]+$/, "", $0)
      print
    }
  '
)"

SCHEME="${DETOX_IOS_SCHEME:-}"
if [[ -z "$SCHEME" ]]; then
  # Prefer a scheme matching workspace name (typical Expo-generated app scheme).
  WORKSPACE_BASENAME_LOWER="$(printf '%s' "$WORKSPACE_BASENAME" | tr '[:upper:]' '[:lower:]')"
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    candidate_lower="$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]')"
    if [[ "$candidate_lower" == "$WORKSPACE_BASENAME_LOWER" ]]; then
      SCHEME="$candidate"
      break
    fi
  done <<< "$ALL_SCHEMES_RAW"
fi

if [[ -z "$SCHEME" ]]; then
  # Fallback: pick first scheme that builds an application target (WRAPPER_EXTENSION=app).
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if xcodebuild -workspace "$WORKSPACE" -scheme "$candidate" -showBuildSettings -configuration "$IOS_BUILD_CONFIGURATION" -sdk iphonesimulator 2>/dev/null | grep -q "WRAPPER_EXTENSION = app"; then
      SCHEME="$candidate"
      break
    fi
  done <<< "$ALL_SCHEMES_RAW"
fi

if [[ -z "$SCHEME" ]]; then
  AVAILABLE_SCHEMES="$(printf '%s' "$ALL_SCHEMES_RAW" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
  echo "Could not determine an iOS app scheme from workspace '$WORKSPACE'."
  echo "Available schemes: ${AVAILABLE_SCHEMES:-<none>}"
  echo "Set DETOX_IOS_SCHEME and retry."
  exit 1
fi

echo "Using iOS scheme: $SCHEME"
echo "Using iOS build configuration: $IOS_BUILD_CONFIGURATION"

BUILD_LOG="$ARTIFACTS_DIR/ios-build.log"
echo "Building iOS app for Detox (log: $BUILD_LOG)"

XCODEBUILD_ARGS=(
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$IOS_BUILD_CONFIGURATION"
  -sdk iphonesimulator
  -destination "generic/platform=iOS Simulator"
  -derivedDataPath ios/build
)

if [[ "${DETOX_VERBOSE_BUILD:-false}" == "true" ]]; then
  xcodebuild "${XCODEBUILD_ARGS[@]}"
else
  if ! xcodebuild "${XCODEBUILD_ARGS[@]}" >"$BUILD_LOG" 2>&1; then
    echo "iOS Detox build failed. Last 120 lines from $BUILD_LOG:"
    tail -n 120 "$BUILD_LOG" || true
    exit 1
  fi
fi

PRODUCTS_DIR="ios/build/Build/Products/${IOS_BUILD_CONFIGURATION}-iphonesimulator"
APP_PATH="$(find "$PRODUCTS_DIR" -type d -name "*.app" ! -name "*Tests.app" | head -n1 || true)"
if [[ -z "$APP_PATH" ]]; then
  echo "Built iOS app not found under $PRODUCTS_DIR."
  echo "See build log: $BUILD_LOG"
  exit 1
fi

APP_ABS="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
rm -rf ios/build/DetoxApp.app
ln -s "$APP_ABS" ios/build/DetoxApp.app

echo "iOS Detox binary ready at ios/build/DetoxApp.app"
echo "iOS build log: $BUILD_LOG"

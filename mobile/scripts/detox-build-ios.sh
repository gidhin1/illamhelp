#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="artifacts/detox"
mkdir -p "$ARTIFACTS_DIR"
IOS_BUILD_CONFIGURATION="${DETOX_IOS_BUILD_CONFIGURATION:-Release}"

if [[ ! -d ios || -z "$(find ios -maxdepth 1 \( -name "*.xcworkspace" -o -name "*.xcodeproj" \) | head -n1)" || ! -f ios/Podfile ]]; then
  echo "iOS native project missing/incomplete. Running Expo prebuild (iOS)..."
  CI=1 pnpm exec expo prebuild --platform ios --clean
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods is required for iOS Detox build. Install with: sudo gem install cocoapods"
  exit 1
fi
(cd ios && pod install)

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" | head -n1 || true)"
if [[ -z "$WORKSPACE" ]]; then
  echo "Could not find an iOS workspace in mobile/ios."
  exit 1
fi

SCHEME="${DETOX_IOS_SCHEME:-}"
if [[ -z "$SCHEME" ]]; then
  workspace_name="$(basename "$WORKSPACE" .xcworkspace)"
  schemes_raw="$(xcodebuild -workspace "$WORKSPACE" -list 2>/dev/null | awk '/Schemes:/ { in_schemes = 1; next } in_schemes && NF { gsub(/^[ \t]+|[ \t]+$/, "", $0); print }')"
  if printf '%s\n' "$schemes_raw" | grep -Fxq "$workspace_name"; then
    SCHEME="$workspace_name"
  else
    SCHEME="$(printf '%s\n' "$schemes_raw" | head -n1)"
  fi
fi
if [[ -z "$SCHEME" ]]; then
  echo "Could not determine an iOS scheme. Set DETOX_IOS_SCHEME and retry."
  exit 1
fi

echo "Using iOS scheme: $SCHEME"
echo "Using iOS build configuration: $IOS_BUILD_CONFIGURATION"

BUILD_LOG="$ARTIFACTS_DIR/ios-build.log"
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

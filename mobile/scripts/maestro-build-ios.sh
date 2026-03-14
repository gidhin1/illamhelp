#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="artifacts/maestro"
mkdir -p "$ARTIFACTS_DIR"
IOS_BUILD_CONFIGURATION="${MAESTRO_IOS_BUILD_CONFIGURATION:-Release}"

if [[ "${MAESTRO_CLEAN_BUILD:-false}" == "true" ]]; then
  echo "Cleaning stale iOS derived build output..."
  rm -rf ios/build
fi

if [[ ! -d ios || -z "$(find ios -maxdepth 1 \( -name "*.xcworkspace" -o -name "*.xcodeproj" \) | head -n1)" || ! -f ios/Podfile ]]; then
  echo "iOS native project missing/incomplete. Running Expo prebuild (iOS)..."
  CI=1 pnpm exec expo prebuild --platform ios --clean
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods is required for iOS Maestro build. Install with: sudo gem install cocoapods"
  exit 1
fi

PODS_MANIFEST="ios/Pods/Manifest.lock"
if [[ "${MAESTRO_CLEAN_BUILD:-false}" == "true" || ! -f "$PODS_MANIFEST" || ios/Podfile.lock -nt "$PODS_MANIFEST" || ! -d ios/build/generated/ios ]]; then
  echo "Running pod install for iOS dependencies..."
  (cd ios && pod install)
else
  echo "Pods are already in sync. Skipping pod install."
fi

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" | head -n1 || true)"
if [[ -z "$WORKSPACE" ]]; then
  echo "Could not find an iOS workspace in mobile/ios."
  exit 1
fi

SCHEME="${MAESTRO_IOS_SCHEME:-}"
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
  echo "Could not determine an iOS scheme. Set MAESTRO_IOS_SCHEME and retry."
  exit 1
fi

BUILD_LOG="$ARTIFACTS_DIR/ios-build.log"
XCODEBUILD_ARGS=(
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$IOS_BUILD_CONFIGURATION"
  -sdk iphonesimulator
  -destination "generic/platform=iOS Simulator"
  -derivedDataPath ios/build
)

if [[ "${MAESTRO_VERBOSE:-false}" == "true" ]]; then
  echo "Starting iOS build with xcodebuild (scheme: $SCHEME, configuration: $IOS_BUILD_CONFIGURATION)..."
  xcodebuild "${XCODEBUILD_ARGS[@]}"
else
  echo "Starting iOS build with xcodebuild (scheme: $SCHEME, configuration: $IOS_BUILD_CONFIGURATION)..."
  echo "Streaming build output. Full log: $BUILD_LOG"
  if ! xcodebuild "${XCODEBUILD_ARGS[@]}" 2>&1 | tee "$BUILD_LOG"; then
    echo "iOS Maestro build failed. Last 120 lines from $BUILD_LOG:"
    tail -n 120 "$BUILD_LOG" || true
    exit 1
  fi
fi

PRODUCTS_DIR="ios/build/Build/Products/${IOS_BUILD_CONFIGURATION}-iphonesimulator"
APP_PATH="$(find "$PRODUCTS_DIR" -type d -name "*.app" -not -name "*Tests.app" | head -n1 || true)"
if [[ -z "$APP_PATH" ]]; then
  echo "Built iOS app not found under $PRODUCTS_DIR."
  exit 1
fi

APP_ABS="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
rm -rf ios/build/MaestroApp.app
ln -s "$APP_ABS" ios/build/MaestroApp.app

echo "iOS Maestro app ready at ios/build/MaestroApp.app"

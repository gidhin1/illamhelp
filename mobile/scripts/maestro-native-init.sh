#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IOS_READY=false
ANDROID_READY=false

if [[ -d ios ]] && [[ -n "$(find ios -maxdepth 1 \( -name "*.xcworkspace" -o -name "*.xcodeproj" \) | head -n1)" ]]; then
  IOS_READY=true
fi

if [[ -f android/app/build.gradle ]]; then
  ANDROID_READY=true
fi

if [[ "$IOS_READY" != "true" || "$ANDROID_READY" != "true" ]]; then
  echo "Generating native iOS/Android projects with Expo prebuild..."
  CI=1 pnpm exec expo prebuild --clean
fi

echo "Maestro native project initialization complete."

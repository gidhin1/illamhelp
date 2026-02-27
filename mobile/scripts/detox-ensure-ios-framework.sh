#!/usr/bin/env bash
set -euo pipefail

FRAMEWORK_ROOT="${HOME}/Library/Detox/ios/framework"

has_framework=false
if [[ -d "$FRAMEWORK_ROOT" ]]; then
  if find "$FRAMEWORK_ROOT" -type d -name "Detox.framework" -print -quit | grep -q .; then
    has_framework=true
  fi
fi

if [[ "$has_framework" == "true" ]]; then
  echo "Detox iOS framework cache found."
  exit 0
fi

echo "Detox iOS framework cache missing. Rebuilding cache..."
pnpm exec detox clean-framework-cache || true
pnpm exec detox build-framework-cache
echo "Detox iOS framework cache rebuilt."

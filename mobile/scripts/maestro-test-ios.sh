#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
MAESTRO_BIN="$(bash ./scripts/maestro-check.sh)"

DEVICE_NAME="${MAESTRO_IOS_DEVICE:-iPhone 16e}"
FLOW_TARGET="${MAESTRO_FLOW:-.maestro/flows/suite-ios.yaml}"
ARTIFACTS_DIR="${MAESTRO_ARTIFACTS_DIR:-artifacts/maestro/ios}"
RUN_LOG_FILE="${MAESTRO_RUN_LOG_FILE:-${ARTIFACTS_DIR}/maestro-ios.log}"
APP_PATH="ios/build/MaestroApp.app"
APP_ID="${MAESTRO_APP_ID:-com.anonymous.illamhelp}"
MAESTRO_FORCE_BUILD="${MAESTRO_FORCE_BUILD:-false}"
BUNDLE_PATH="${APP_PATH}/main.jsbundle"

mkdir -p "$ARTIFACTS_DIR"
: > "$RUN_LOG_FILE"
exec > >(tee -a "$RUN_LOG_FILE") 2>&1

if [[ "${MAESTRO_SKIP_BUILD:-false}" != "true" ]]; then
  if [[ "${MAESTRO_FORCE_BUILD}" == "true" || ! -e "$APP_PATH" || ! -f "$BUNDLE_PATH" ]]; then
    bash ./scripts/maestro-build-ios.sh
  else
    echo "Reusing existing iOS build at $APP_PATH"
  fi
fi

if [[ ! -e "$APP_PATH" ]]; then
  echo "Built iOS app not found at $APP_PATH"
  exit 1
fi

if [[ ! -f "$BUNDLE_PATH" ]]; then
  echo "Bundled JS not found at $BUNDLE_PATH. Rebuild with MAESTRO_FORCE_BUILD=true if this persists."
  exit 1
fi

DEVICE_UDID="$(xcrun simctl list devices available | awk -F '[()]' -v device="$DEVICE_NAME" '$0 ~ device { print $2; exit }')"
if [[ -z "$DEVICE_UDID" ]]; then
  echo "Could not find available iOS simulator named: $DEVICE_NAME"
  exit 1
fi

xcrun simctl boot "$DEVICE_UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_UDID" -b
xcrun simctl install "$DEVICE_UDID" "$APP_PATH"

bash ./scripts/maestro-env.sh "$MAESTRO_BIN" test --platform ios --device "$DEVICE_UDID" "$FLOW_TARGET"

echo "Maestro iOS run complete for app $APP_ID"

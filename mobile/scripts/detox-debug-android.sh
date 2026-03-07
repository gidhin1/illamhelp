#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="${DETOX_ARTIFACTS_DIR:-artifacts/detox/debug-android}"
RUN_LOG_FILE="${DETOX_RUN_LOG_FILE:-${ARTIFACTS_DIR}/detox-debug-android.log}"

mkdir -p "$ARTIFACTS_DIR"
: >"$RUN_LOG_FILE"
exec > >(tee -a "$RUN_LOG_FILE") 2>&1
trap 'echo "Detox Android debug log saved at: $RUN_LOG_FILE"' EXIT

if [[ "${DETOX_SKIP_BUILD:-false}" != "true" ]]; then
  DETOX_ANDROID_BUILD_TYPE="${DETOX_ANDROID_BUILD_TYPE:-release}" pnpm run e2e:detox:build:android
fi

DETOX_ANDROID_CONFIGURATION="${DETOX_ANDROID_CONFIGURATION:-android.emu.release}" \
DETOX_ANDROID_BUILD_TYPE="${DETOX_ANDROID_BUILD_TYPE:-release}" \
DETOX_LOGLEVEL="${DETOX_LOGLEVEL:-trace}" \
DETOX_RECORD_LOGS=all \
DETOX_TAKE_SCREENSHOTS=all \
DETOX_RECORD_VIDEOS=all \
DETOX_JEST_REPORT_SPECS="${DETOX_JEST_REPORT_SPECS:-true}" \
DETOX_ARTIFACTS_DIR="$ARTIFACTS_DIR" \
DETOX_TEST_FILE="${DETOX_TEST_FILE:-e2e/full-flow.e2e.js}" \
DETOX_TEST_NAME_PATTERN="${DETOX_TEST_NAME_PATTERN:-}" \
bash ./scripts/detox-test-android.sh

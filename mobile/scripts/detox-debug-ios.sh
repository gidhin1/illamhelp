#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG="${DETOX_IOS_CONFIGURATION:-ios.sim.release}"
LOGLEVEL="${DETOX_LOGLEVEL:-trace}"
TEST_FILE="${DETOX_TEST_FILE:-e2e/full-flow.e2e.js}"
TEST_NAME_PATTERN="${DETOX_TEST_NAME_PATTERN:-}"
ARTIFACTS_DIR="${DETOX_ARTIFACTS_DIR:-artifacts/detox/debug-ios}"
RUN_LOG_FILE="${DETOX_RUN_LOG_FILE:-${ARTIFACTS_DIR}/detox-debug-ios.log}"

mkdir -p "$ARTIFACTS_DIR"
: >"$RUN_LOG_FILE"
exec > >(tee -a "$RUN_LOG_FILE") 2>&1
trap 'echo "Detox iOS debug log saved at: $RUN_LOG_FILE"' EXIT

pnpm run e2e:detox:check:ios
pnpm run e2e:detox:prepare:ios
if [[ "${DETOX_SKIP_BUILD:-false}" != "true" ]]; then
  pnpm run e2e:detox:build:ios
fi

CMD=(pnpm exec detox test -c "$CONFIG" --cleanup --loglevel "$LOGLEVEL" --artifacts-location "$ARTIFACTS_DIR" --record-logs all --take-screenshots all --record-videos all "$TEST_FILE")
if [[ -n "$TEST_NAME_PATTERN" ]]; then
  CMD+=(--testNamePattern "$TEST_NAME_PATTERN")
fi
if [[ "${DETOX_JEST_REPORT_SPECS:-true}" == "true" ]]; then
  CMD+=(--jest-report-specs)
fi
"${CMD[@]}"

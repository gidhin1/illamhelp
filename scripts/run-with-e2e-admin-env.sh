#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]"
  exit 1
fi

cleanup() {
  local exit_code="$?"
  trap - EXIT INT TERM
  bash "${ROOT_DIR}/scripts/e2e-admin-cleanup.sh" || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

bash "${ROOT_DIR}/scripts/e2e-admin-setup.sh"

set -a
source "${ENV_FILE}"
set +a

"$@"

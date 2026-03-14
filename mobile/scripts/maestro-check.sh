#!/usr/bin/env bash
set -euo pipefail

export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"

resolve_maestro_bin() {
  if [[ -n "${MAESTRO_BIN:-}" && -x "${MAESTRO_BIN}" ]]; then
    printf '%s\n' "${MAESTRO_BIN}"
    return 0
  fi

  if command -v maestro >/dev/null 2>&1; then
    command -v maestro
    return 0
  fi

  if [[ -x "${HOME}/.maestro/bin/maestro" ]]; then
    printf '%s\n' "${HOME}/.maestro/bin/maestro"
    return 0
  fi

  return 1
}

if ! MAESTRO_BIN_PATH="$(resolve_maestro_bin)"; then
  cat >&2 <<'EOF'
Maestro CLI is required but was not found on PATH.

Install the mobile testing CLI with:
  curl -Ls "https://get.maestro.mobile.dev" | bash

Then restart your shell, or export:
  export PATH="$HOME/.maestro/bin:$PATH"

Note: `brew install maestro` installs the unrelated desktop app cask, not the mobile test CLI.
EOF
  exit 1
fi

"${MAESTRO_BIN_PATH}" --version >/dev/null
printf '%s\n' "${MAESTRO_BIN_PATH}"

#!/bin/bash
set -euo pipefail

echo "IllamHelp local environment doctor"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Note: this script is optimized for macOS, current OS: $(uname -s)"
fi

ARCH="$(uname -m)"
echo "Architecture: ${ARCH}"
if [[ "${ARCH}" == "arm64" ]]; then
  echo "Apple Silicon detected."
fi

echo

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "${cmd}" >/dev/null 2>&1; then
    echo "OK   ${label}: $(command -v "${cmd}")"
  else
    echo "MISS ${label}: command not found"
  fi
}

check_cmd docker "Docker CLI"
check_cmd pnpm "pnpm"
check_cmd node "Node.js"
check_cmd psql "PostgreSQL client (optional)"

echo

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo "OK   Docker daemon is running"
  else
    echo "MISS Docker daemon is not running (start Docker Desktop/Colima)"
  fi
fi

if command -v node >/dev/null 2>&1; then
  if NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"; then
    if [[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]] && [[ "${NODE_MAJOR}" -lt 24 ]]; then
      echo "WARN Node ${NODE_MAJOR}.x detected, 24.x is recommended"
    else
      echo "OK   Node version: $(node -v)"
    fi
  else
    echo "WARN Unable to parse Node version"
  fi
fi

MEM_GB="$(
  (sysctl -n hw.memsize 2>/dev/null || true) |
    awk '{if ($1 != "") printf "%.1f", $1/1024/1024/1024}'
)"
if [[ -n "${MEM_GB}" ]]; then
  echo "Memory: ${MEM_GB} GB"
  echo "Tip: for full stack (with OpenSearch+Keycloak+ClamAV), allocate at least 6 GB to Docker."
fi

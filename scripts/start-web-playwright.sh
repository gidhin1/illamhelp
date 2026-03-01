#!/bin/bash
set -euo pipefail

ROOT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)"
LOCK_FILE="${ROOT_DIR}/web/.next/dev/lock"
WEB_URL="${PW_WEB_BASE_URL:-http://localhost:3000}"

if [[ -f "${LOCK_FILE}" ]]; then
  LOCK_HOLDERS="$(
    lsof -t "${LOCK_FILE}" 2>/dev/null | tr '\n' ' ' | xargs || true
  )"
  if [[ -n "${LOCK_HOLDERS}" ]]; then
    echo "Stopping existing Next dev process(es) holding lock: ${LOCK_HOLDERS}"
    kill ${LOCK_HOLDERS} >/dev/null 2>&1 || true
    sleep 1
    REMAINING_HOLDERS="$(
      lsof -t "${LOCK_FILE}" 2>/dev/null | tr '\n' ' ' | xargs || true
    )"
    if [[ -n "${REMAINING_HOLDERS}" ]]; then
      echo "Force-stopping lingering lock holder(s): ${REMAINING_HOLDERS}"
      kill -9 ${REMAINING_HOLDERS} >/dev/null 2>&1 || true
    fi
  fi
  rm -f "${LOCK_FILE}"
fi

WEB_PORT="$(
  node -e '
    try {
      const input = process.argv[1];
      const url = new URL(input);
      if (url.port) {
        process.stdout.write(url.port);
        process.exit(0);
      }
      process.stdout.write(url.protocol === "https:" ? "443" : "80");
    } catch {
      process.stderr.write(`Invalid PW_WEB_BASE_URL: ${process.argv[1]}\n`);
      process.exit(1);
    }
  ' "${WEB_URL}"
)"

PORT="${WEB_PORT}" pnpm --filter @illamhelp/web dev

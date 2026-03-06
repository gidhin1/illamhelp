#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
PROFILE="${DEV_PROFILE:-full}"
WEB_PORT="${WEB_PORT:-3001}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"

bash ./scripts/preflight.sh

if [[ "${PROFILE}" == "core" ]]; then
  make up-core
else
  make up
fi

make keycloak-bootstrap
make migrate

CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT},http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3003,http://127.0.0.1:3003}" pnpm dev:api &
API_PID=$!

PORT="${WEB_PORT}" pnpm dev:web &
WEB_PID=$!

echo "API: http://localhost:4000/api/v1/health"
echo "Swagger: http://localhost:4000/api/docs"
echo "Web: http://localhost:${WEB_PORT}"
echo "Mobile (Expo): pnpm dev:mobile"

echo "Press Ctrl+C to stop."
wait "${API_PID}" "${WEB_PID}"

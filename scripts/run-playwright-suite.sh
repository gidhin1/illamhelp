#!/bin/bash
set -euo pipefail

ROOT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-illamhelp}"

if [[ "$#" -lt 1 ]]; then
  echo "Usage: $0 <playwright-config> [extra playwright args...]"
  exit 1
fi

CONFIG_PATH="$1"
shift

cd "${ROOT_DIR}"

bash ./scripts/preflight.sh
docker compose \
  --project-name "${COMPOSE_PROJECT}" \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  up -d postgres redis minio minio-init nats opa keycloak

bash ./scripts/keycloak-dev-bootstrap.sh
make migrate

exec pnpm exec playwright test -c "${CONFIG_PATH}" "$@"

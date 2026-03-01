#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
CONTAINER_NAME="illamhelp-keycloak"

read_env_value() {
  local key="$1"
  local file="$2"
  local raw
  raw="$(grep -E "^${key}=" "${file}" | tail -n1 | cut -d= -f2- || true)"
  raw="${raw%$'\r'}"

  if [[ "${raw}" =~ ^\".*\"$ ]]; then
    raw="${raw:1:${#raw}-2}"
  elif [[ "${raw}" =~ ^\'.*\'$ ]]; then
    raw="${raw:1:${#raw}-2}"
  fi

  printf "%s" "${raw}"
}

get_client_internal_id() {
  local realm="$1"
  local client_id="$2"
  local clients_json
  clients_json="$(
    docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh get clients \
      -r "${realm}" \
      -q "clientId=${client_id}" \
      --fields "id,clientId" 2>/dev/null || true
  )"

  echo "${clients_json}" |
    sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n1
}

ensure_realm_role() {
  local realm="$1"
  local role_name="$2"

  if docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh get "roles/${role_name}" \
    -r "${realm}" >/dev/null 2>&1; then
    return 0
  fi

  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh create roles \
    -r "${realm}" \
    -s name="${role_name}" \
    -s "description=IllamHelp application role: ${role_name}" >/dev/null
}

if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)" != "true" ]]; then
  echo "${CONTAINER_NAME} is not running. Start it first with: make up-auth"
  exit 1
fi

KEYCLOAK_REALM="${KEYCLOAK_REALM:-}"
if [[ -z "${KEYCLOAK_REALM}" && -f "${ENV_FILE}" ]]; then
  KEYCLOAK_REALM="$(read_env_value "KEYCLOAK_REALM" "${ENV_FILE}")"
fi
KEYCLOAK_REALM="${KEYCLOAK_REALM:-illamhelp}"

KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-}"
if [[ -z "${KEYCLOAK_CLIENT_ID}" && -f "${ENV_FILE}" ]]; then
  KEYCLOAK_CLIENT_ID="$(read_env_value "KEYCLOAK_CLIENT_ID" "${ENV_FILE}")"
fi
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-illamhelp-api}"

KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-}"
if [[ -z "${KEYCLOAK_CLIENT_SECRET}" && -f "${ENV_FILE}" ]]; then
  KEYCLOAK_CLIENT_SECRET="$(read_env_value "KEYCLOAK_CLIENT_SECRET" "${ENV_FILE}")"
fi

KEYCLOAK_ADMIN_USER="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN 2>/dev/null || true)"
KEYCLOAK_ADMIN_PASSWORD="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || true)"

if [[ -z "${KEYCLOAK_ADMIN_USER}" || -z "${KEYCLOAK_ADMIN_PASSWORD}" ]]; then
  echo "KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD are not set in the running Keycloak container."
  echo "Set them in .env, then run: make down && make up-auth"
  exit 1
fi

echo "Waiting for Keycloak admin API..."
for _ in {1..45}; do
  if docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh config credentials \
    --server "http://localhost:8080" \
    --realm "master" \
    --user "${KEYCLOAK_ADMIN_USER}" \
    --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh config credentials \
  --server "http://localhost:8080" \
  --realm "master" \
  --user "${KEYCLOAK_ADMIN_USER}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
  echo "Failed to authenticate to Keycloak admin API."
  exit 1
fi

echo "Ensuring master admin client 'admin-cli'..."
ADMIN_CLI_INTERNAL_ID="$(get_client_internal_id "master" "admin-cli")"
if [[ -z "${ADMIN_CLI_INTERNAL_ID}" ]]; then
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh create clients \
    -r "master" \
    -s clientId="admin-cli" \
    -s protocol=openid-connect \
    -s enabled=true \
    -s publicClient=true \
    -s directAccessGrantsEnabled=true \
    -s standardFlowEnabled=false \
    -s serviceAccountsEnabled=false >/dev/null
  ADMIN_CLI_INTERNAL_ID="$(get_client_internal_id "master" "admin-cli")"
fi

if [[ -z "${ADMIN_CLI_INTERNAL_ID}" ]]; then
  echo "Failed to resolve admin-cli client in master realm."
  exit 1
fi

docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh update "clients/${ADMIN_CLI_INTERNAL_ID}" \
  -r "master" \
  -s clientId="admin-cli" \
  -s protocol=openid-connect \
  -s enabled=true \
  -s publicClient=true \
  -s directAccessGrantsEnabled=true \
  -s standardFlowEnabled=false \
  -s serviceAccountsEnabled=false >/dev/null

echo "Applying local dev realm SSL policy..."
docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh update realms/master \
  -s sslRequired=NONE >/dev/null

if docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh get "realms/${KEYCLOAK_REALM}" >/dev/null 2>&1; then
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh update "realms/${KEYCLOAK_REALM}" \
    -s enabled=true \
    -s sslRequired=NONE >/dev/null
else
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh create realms \
    -s realm="${KEYCLOAK_REALM}" \
    -s enabled=true \
    -s sslRequired=NONE >/dev/null
fi

echo "Ensuring app roles in realm '${KEYCLOAK_REALM}'..."
for role_name in both seeker provider admin support; do
  ensure_realm_role "${KEYCLOAK_REALM}" "${role_name}"
done

echo "Ensuring Keycloak client '${KEYCLOAK_CLIENT_ID}' in realm '${KEYCLOAK_REALM}'..."
CLIENT_INTERNAL_ID="$(get_client_internal_id "${KEYCLOAK_REALM}" "${KEYCLOAK_CLIENT_ID}")"
if [[ -z "${CLIENT_INTERNAL_ID}" ]]; then
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh create clients \
    -r "${KEYCLOAK_REALM}" \
    -s clientId="${KEYCLOAK_CLIENT_ID}" \
    -s protocol=openid-connect \
    -s enabled=true \
    -s publicClient=true \
    -s directAccessGrantsEnabled=true \
    -s standardFlowEnabled=true \
    -s serviceAccountsEnabled=false >/dev/null
  CLIENT_INTERNAL_ID="$(get_client_internal_id "${KEYCLOAK_REALM}" "${KEYCLOAK_CLIENT_ID}")"
fi

if [[ -z "${CLIENT_INTERNAL_ID}" ]]; then
  echo "Failed to resolve Keycloak client '${KEYCLOAK_CLIENT_ID}'."
  exit 1
fi

docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh update "clients/${CLIENT_INTERNAL_ID}" \
  -r "${KEYCLOAK_REALM}" \
  -s clientId="${KEYCLOAK_CLIENT_ID}" \
  -s protocol=openid-connect \
  -s enabled=true \
  -s publicClient=true \
  -s directAccessGrantsEnabled=true \
  -s standardFlowEnabled=true \
  -s serviceAccountsEnabled=false >/dev/null

echo "Keycloak dev bootstrap complete (realms: master, ${KEYCLOAK_REALM}; sslRequired=NONE, public client=${KEYCLOAK_CLIENT_ID})."

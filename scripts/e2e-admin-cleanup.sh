#!/bin/bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/.cache"
STATE_FILE="${E2E_ADMIN_STATE_FILE:-${STATE_DIR}/e2e-admin-state.env}"
APP_ENV_FILE="${ROOT_DIR}/.env"
CONTAINER_NAME="${KEYCLOAK_CONTAINER_NAME:-illamhelp-keycloak}"

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
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

kc() {
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh "$@"
}

remove_env_key() {
  local key="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v k="${key}" '$0 !~ ("^" k "=") { print }' "${file}" >"${tmp_file}"
  mv "${tmp_file}" "${file}"
}

cleanup_local_artifacts() {
  rm -f "${STATE_FILE}" || true
  remove_env_key "E2E_ADMIN_USERNAME" "${APP_ENV_FILE}" || true
  remove_env_key "E2E_ADMIN_PASSWORD" "${APP_ENV_FILE}" || true
}

trap cleanup_local_artifacts EXIT

if [[ ! -f "${STATE_FILE}" ]]; then
  exit 0
fi

username="$(read_env_value "E2E_ADMIN_CREATED_USERNAME" "${STATE_FILE}")"
realm="$(read_env_value "E2E_ADMIN_CREATED_REALM" "${STATE_FILE}")"
realm="${realm:-illamhelp}"

if [[ -z "${username}" ]]; then
  exit 0
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)" != "true" ]]; then
  exit 0
fi

admin_user="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN 2>/dev/null || true)"
admin_password="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || true)"
if [[ -z "${admin_user}" || -z "${admin_password}" ]]; then
  exit 0
fi

if ! kc config credentials \
  --server "http://localhost:8080" \
  --realm "master" \
  --user "${admin_user}" \
  --password "${admin_password}" >/dev/null 2>&1; then
  exit 0
fi

users_json="$(kc get users -r "${realm}" -q "username=${username}" -q exact=true --fields "id,username" 2>/dev/null || true)"
user_id="$(
  printf "%s" "${users_json}" |
    sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n1
)"
if [[ -n "${user_id}" ]]; then
  kc delete "users/${user_id}" -r "${realm}" >/dev/null 2>&1 || true
  echo "Deleted E2E admin account: ${username}"
fi

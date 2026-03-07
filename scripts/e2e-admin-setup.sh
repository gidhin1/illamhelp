#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
STATE_DIR="${ROOT_DIR}/.cache"
STATE_FILE="${E2E_ADMIN_STATE_FILE:-${STATE_DIR}/e2e-admin-state.env}"
CONTAINER_NAME="${KEYCLOAK_CONTAINER_NAME:-illamhelp-keycloak}"

mkdir -p "${STATE_DIR}"

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

upsert_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  if [[ -f "${file}" ]]; then
    awk -v k="${key}" -v v="${value}" '
      BEGIN { updated = 0 }
      $0 ~ ("^" k "=") { print k "=" v; updated = 1; next }
      { print }
      END { if (!updated) print k "=" v }
    ' "${file}" >"${tmp_file}"
  else
    printf "%s=%s\n" "${key}" "${value}" >"${tmp_file}"
  fi
  mv "${tmp_file}" "${file}"
}

kc() {
  docker exec "${CONTAINER_NAME}" /opt/keycloak/bin/kcadm.sh "$@"
}

if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)" != "true" ]]; then
  echo "${CONTAINER_NAME} is not running. Start it with: make up-auth"
  exit 1
fi

KEYCLOAK_REALM="${KEYCLOAK_REALM:-$(read_env_value "KEYCLOAK_REALM" "${ENV_FILE}")}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-illamhelp}"

KEYCLOAK_ADMIN_USER="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN 2>/dev/null || true)"
KEYCLOAK_ADMIN_PASSWORD="$(docker exec "${CONTAINER_NAME}" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || true)"

if [[ -z "${KEYCLOAK_ADMIN_USER}" || -z "${KEYCLOAK_ADMIN_PASSWORD}" ]]; then
  echo "KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD are missing in ${CONTAINER_NAME}."
  exit 1
fi

for _ in {1..45}; do
  if kc config credentials \
    --server "http://localhost:8080" \
    --realm "master" \
    --user "${KEYCLOAK_ADMIN_USER}" \
    --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! kc config credentials \
  --server "http://localhost:8080" \
  --realm "master" \
  --user "${KEYCLOAK_ADMIN_USER}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
  echo "Failed to authenticate against Keycloak admin API."
  exit 1
fi

username="ops_admin_$(printf '%s' "${RANDOM}$(date +%s%N)" | tr -dc 'a-z0-9' | tail -c 10)"
password="Adm!$(printf '%s' "${RANDOM}$(date +%s%N)" | tr -dc '0-9' | tail -c 8)aZ"

email="${username}@illamhelp-e2e.local"

user_json="$(kc get users -r "${KEYCLOAK_REALM}" -q "username=${username}" -q exact=true --fields "id,username" 2>/dev/null || true)"
user_id="$(
  printf "%s" "${user_json}" |
    sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n1
)"

if [[ -z "${user_id}" ]]; then
  kc create users \
    -r "${KEYCLOAK_REALM}" \
    -s "username=${username}" \
    -s "enabled=true" \
    -s "email=${email}" \
    -s "emailVerified=true" \
    -s "firstName=E2E" \
    -s "lastName=Admin" >/dev/null
fi

kc set-password \
  -r "${KEYCLOAK_REALM}" \
  --username "${username}" \
  --new-password "${password}" >/dev/null

kc add-roles -r "${KEYCLOAK_REALM}" --uusername "${username}" --rolename "admin" >/dev/null

upsert_env_value "E2E_ADMIN_USERNAME" "${username}" "${ENV_FILE}"
upsert_env_value "E2E_ADMIN_PASSWORD" "${password}" "${ENV_FILE}"

umask 077
cat >"${STATE_FILE}" <<EOF
E2E_ADMIN_CREATED_USERNAME=${username}
E2E_ADMIN_CREATED_REALM=${KEYCLOAK_REALM}
EOF

echo "E2E admin account prepared: ${username}"
echo "Updated env file: ${ENV_FILE}"

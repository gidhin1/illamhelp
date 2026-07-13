#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
NAMESPACE="${K8S_NAMESPACE:-illamhelp}"
SECRET_NAME="${K8S_SECRET_NAME:-illamhelp-secrets}"
INFRA_RELEASE="${K8S_INFRA_RELEASE:-illamhelp}"

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf "%s" "$value"
}

read_env_value() {
  local key="$1"
  awk -v target="$key" '
    $0 ~ "^[[:space:]]*" target "=" {
      line = $0
      sub(/^[[:space:]]*[^=]*=/, "", line)
      value = line
    }
    END { print value }
  ' "$ENV_FILE"
}

env_value() {
  trim_quotes "$(read_env_value "$1")"
}

required_value() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [[ -z "$value" ]]; then
    echo "Missing required ${key} in ${ENV_FILE}." >&2
    exit 1
  fi
  printf "%s" "$value"
}

url_encode() {
  local value="$1"
  local encoded=""
  local char
  local hex
  local i
  for ((i = 0; i < ${#value}; i++)); do
    char="${value:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *)
        printf -v hex '%%%02X' "'$char"
        encoded+="$hex"
        ;;
    esac
  done
  printf "%s" "$encoded"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "${ENV_FILE} is missing. Run 'make init-env' and fill the required values." >&2
  exit 1
fi

POSTGRES_DB="$(required_value POSTGRES_DB)"
POSTGRES_USER="$(required_value POSTGRES_USER)"
POSTGRES_PASSWORD="$(required_value POSTGRES_PASSWORD)"
REDIS_PASSWORD="$(required_value REDIS_PASSWORD)"
MINIO_ROOT_USER="$(required_value MINIO_ROOT_USER)"
MINIO_ROOT_PASSWORD="$(required_value MINIO_ROOT_PASSWORD)"
KEYCLOAK_ADMIN="$(required_value KEYCLOAK_ADMIN)"
KEYCLOAK_ADMIN_PASSWORD="$(required_value KEYCLOAK_ADMIN_PASSWORD)"
PROFILE_PII_ENCRYPTION_KEY="$(required_value PROFILE_PII_ENCRYPTION_KEY)"
NATS_USER="$(required_value NATS_USER)"
NATS_PASSWORD="$(required_value NATS_PASSWORD)"
OPENSEARCH_INITIAL_ADMIN_PASSWORD="$(required_value OPENSEARCH_INITIAL_ADMIN_PASSWORD)"
OPENSEARCH_USERNAME="$(env_value OPENSEARCH_USERNAME)"
OPENSEARCH_PASSWORD="$(env_value OPENSEARCH_PASSWORD)"

OPENSEARCH_USERNAME="${OPENSEARCH_USERNAME:-admin}"
OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-$OPENSEARCH_INITIAL_ADMIN_PASSWORD}"
REDIS_PASSWORD_URI="$(url_encode "$REDIS_PASSWORD")"
NATS_USER_URI="$(url_encode "$NATS_USER")"
NATS_PASSWORD_URI="$(url_encode "$NATS_PASSWORD")"

args=(
  "--from-literal=POSTGRES_DB=${POSTGRES_DB}"
  "--from-literal=POSTGRES_USER=${POSTGRES_USER}"
  "--from-literal=POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  "--from-literal=DATABASE_URL=jdbc:postgresql://${INFRA_RELEASE}-postgres:5432/${POSTGRES_DB}"
  "--from-literal=REDIS_PASSWORD=${REDIS_PASSWORD}"
  "--from-literal=REDIS_URL=redis://:${REDIS_PASSWORD_URI}@${INFRA_RELEASE}-redis:6379"
  "--from-literal=MINIO_ROOT_USER=${MINIO_ROOT_USER}"
  "--from-literal=MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}"
  "--from-literal=KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}"
  "--from-literal=KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}"
  "--from-literal=KEYCLOAK_CLIENT_SECRET=$(env_value KEYCLOAK_CLIENT_SECRET)"
  "--from-literal=PROFILE_PII_ENCRYPTION_KEY=${PROFILE_PII_ENCRYPTION_KEY}"
  "--from-literal=NATS_USER=${NATS_USER}"
  "--from-literal=NATS_PASSWORD=${NATS_PASSWORD}"
  "--from-literal=NATS_URL=nats://${NATS_USER_URI}:${NATS_PASSWORD_URI}@${INFRA_RELEASE}-nats:4222"
  "--from-literal=OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD}"
  "--from-literal=OPENSEARCH_USERNAME=${OPENSEARCH_USERNAME}"
  "--from-literal=OPENSEARCH_PASSWORD=${OPENSEARCH_PASSWORD}"
  "--from-literal=ILLAMHELP_ANALYTICS_GA4_MEASUREMENT_ID=$(env_value ILLAMHELP_ANALYTICS_GA4_MEASUREMENT_ID)"
  "--from-literal=ILLAMHELP_ANALYTICS_GA4_API_SECRET=$(env_value ILLAMHELP_ANALYTICS_GA4_API_SECRET)"
)

kubectl create secret generic "$SECRET_NAME" \
  --namespace "$NAMESPACE" \
  "${args[@]}" \
  --dry-run=client \
  -o yaml | kubectl apply -f - >/dev/null

echo "Applied Kubernetes Secret ${NAMESPACE}/${SECRET_NAME} from ${ENV_FILE}."

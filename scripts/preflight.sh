#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

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
  local file="$2"

  awk -v target="$key" '
    BEGIN { value = "" }
    {
      if ($0 ~ "^[[:space:]]*" target "=") {
        line = $0
        sub(/^[[:space:]]*[^=]*=/, "", line)
        value = line
      }
    }
    END { print value }
  ' "$file"
}

missing_requirements=()
warnings=()

require_command() {
  local cmd="$1"
  local label="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing_requirements+=("$label command is missing ($cmd)")
  fi
}

require_command docker "Docker"
require_command node "Node.js"
require_command pnpm "pnpm"

if [[ -f "$ENV_FILE" ]]; then
  raw_database_url="$(read_env_value "DATABASE_URL" "$ENV_FILE")"
  raw_postgres_user="$(read_env_value "POSTGRES_USER" "$ENV_FILE")"
  raw_postgres_password="$(read_env_value "POSTGRES_PASSWORD" "$ENV_FILE")"
  raw_postgres_db="$(read_env_value "POSTGRES_DB" "$ENV_FILE")"
  raw_keycloak_admin="$(read_env_value "KEYCLOAK_ADMIN" "$ENV_FILE")"
  raw_keycloak_admin_password="$(read_env_value "KEYCLOAK_ADMIN_PASSWORD" "$ENV_FILE")"
  raw_profile_pii_encryption_key="$(read_env_value "PROFILE_PII_ENCRYPTION_KEY" "$ENV_FILE")"

  database_url="$(trim_quotes "$raw_database_url")"
  postgres_user="$(trim_quotes "$raw_postgres_user")"
  postgres_password="$(trim_quotes "$raw_postgres_password")"
  postgres_db="$(trim_quotes "$raw_postgres_db")"
  keycloak_admin="$(trim_quotes "$raw_keycloak_admin")"
  keycloak_admin_password="$(trim_quotes "$raw_keycloak_admin_password")"
  profile_pii_encryption_key="$(trim_quotes "$raw_profile_pii_encryption_key")"

  if [[ -z "$database_url" ]]; then
    if [[ -z "$postgres_user" || -z "$postgres_password" || -z "$postgres_db" ]]; then
      missing_requirements+=(
        "DATABASE_URL is empty and fallback POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB are incomplete"
      )
    fi
  fi

  if [[ -z "$keycloak_admin" || -z "$keycloak_admin_password" ]]; then
    missing_requirements+=("KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD must be set in .env")
  fi

  if [[ -z "$profile_pii_encryption_key" || "${#profile_pii_encryption_key}" -lt 16 ]]; then
    missing_requirements+=(
      "PROFILE_PII_ENCRYPTION_KEY must be set in .env and be at least 16 characters"
    )
  fi
else
  missing_requirements+=(".env file is missing (run: make init-env)")
fi

if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    missing_requirements+=("Docker daemon is not running")
  fi
fi

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [[ -n "$node_major" && "$node_major" =~ ^[0-9]+$ && "$node_major" -lt 24 ]]; then
    warnings+=("Node.js ${node_major}.x detected; 24.x is recommended")
  fi
fi

if [[ ${#missing_requirements[@]} -gt 0 ]]; then
  echo "IllamHelp startup preflight failed:"
  for item in "${missing_requirements[@]}"; do
    echo "- ${item}"
  done
  echo
  echo "Quick fixes:"
  echo "1. Create env file: make init-env"
  echo "2. Fill required env values in .env"
  echo "3. Start Docker Desktop (or Colima) and re-run"
  exit 1
fi

if [[ ${#warnings[@]} -gt 0 ]]; then
  echo "IllamHelp startup preflight warnings:"
  for item in "${warnings[@]}"; do
    echo "- ${item}"
  done
fi

echo "IllamHelp startup preflight passed."

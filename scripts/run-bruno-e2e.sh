#!/bin/bash
set -euo pipefail

on_error() {
  local exit_code=$?
  local line_no="${BASH_LINENO[0]:-unknown}"
  local failed_command="${BASH_COMMAND:-unknown}"
  echo "ERROR: run-bruno-e2e.sh failed (line ${line_no}): ${failed_command}" >&2
  exit "${exit_code}"
}
trap on_error ERR

ROOT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)"
COLLECTION_DIR="${ROOT_DIR}/bruno/illamhelp-api"
RUN_TARGET="requests"
RUN_TAGS="${BRUNO_TAGS:-e2e}"
ENV_NAME="${BRUNO_ENV:-local}"
BASE_URL="${BRUNO_BASE_URL:-http://localhost:4000/api/v1}"
BRUNO_PRINT_EXPORTS="${BRUNO_PRINT_EXPORTS:-false}"
BRUNO_LOGIN_ONLY="${BRUNO_LOGIN_ONLY:-false}"
BRUNO_PREFER_GENERATED_USERS="${BRUNO_PREFER_GENERATED_USERS:-true}"
BRUNO_USER_CACHE_FILE="${BRUNO_USER_CACHE_FILE:-${ROOT_DIR}/.cache/bruno-e2e-users.env}"
AUTH_MAX_ATTEMPTS="${AUTH_MAX_ATTEMPTS:-8}"
AUTH_RETRY_BASE_SECONDS="${AUTH_RETRY_BASE_SECONDS:-2}"

SEEKER_TOKEN="${SEEKER_ACCESS_TOKEN:-}"
PROVIDER_TOKEN="${PROVIDER_ACCESS_TOKEN:-}"
SEEKER_USERNAME="${SEEKER_USERNAME:-}"
SEEKER_PASSWORD="${SEEKER_PASSWORD:-}"
PROVIDER_USERNAME="${PROVIDER_USERNAME:-}"
PROVIDER_PASSWORD="${PROVIDER_PASSWORD:-}"
SEEKER_EMAIL="${SEEKER_EMAIL:-}"
PROVIDER_EMAIL="${PROVIDER_EMAIL:-}"
ADMIN_TOKEN="${ADMIN_ACCESS_TOKEN:-}"
ADMIN_USERNAME="${E2E_ADMIN_USERNAME:-${ADMIN_USERNAME:-}}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-}}"
BRUNO_REQUIRE_ADMIN="${BRUNO_REQUIRE_ADMIN:-true}"

json_escape_login_payload() {
  local username="$1"
  local password="$2"
  node -e '
    const username = process.argv[1];
    const password = process.argv[2];
    process.stdout.write(JSON.stringify({ username, password }));
  ' "${username}" "${password}"
}

extract_access_token() {
  local response_body="$1"
  local token
  token="$(
    node -e '
      const raw = process.argv[1];
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.accessToken === "string" && parsed.accessToken.length > 0) {
          process.stdout.write(parsed.accessToken);
          process.exit(0);
        }
      } catch {}
      process.exit(1);
    ' "${response_body}" 2>/dev/null || true
  )"
  echo "${token}"
}

generate_random_identity() {
  local role_prefix="$1"
  node -e '
    const crypto = require("crypto");
    const rolePrefix = process.argv[1];
    const suffix = `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
    const username = `${rolePrefix}_${suffix}`.slice(0, 40);
    const password = `T${crypto.randomBytes(9).toString("base64url")}9a`;
    const email = `${username}@illamhelp.test`;
    process.stdout.write(`${username}\n${password}\n${email}\n`);
  ' "${role_prefix}"
}

json_escape_register_payload() {
  local username="$1"
  local email="$2"
  local password="$3"
  node -e '
    const [username, email, password] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({
      username,
      email,
      password,
      firstName: "Auto",
      lastName: "Runner"
    }));
  ' "${username}" "${email}" "${password}"
}

auth_backoff_seconds() {
  local attempt="$1"
  local base="${AUTH_RETRY_BASE_SECONDS}"
  local wait=$((base * attempt))
  if ((wait > 30)); then
    wait=30
  fi
  echo "${wait}"
}

auth_request_with_retry() {
  local endpoint="$1"
  local payload="$2"
  local label="$3"
  local action="$4"

  local attempt
  local raw_response=""
  local status_code=""
  local response_body=""

  for ((attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt += 1)); do
    raw_response="$(
      curl -sS -X POST "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        --data "${payload}" \
        -w $'\n%{http_code}' || true
    )"

    response_body="${raw_response%$'\n'*}"
    status_code="${raw_response##*$'\n'}"

    if [[ "${status_code}" == "429" && "${attempt}" -lt "${AUTH_MAX_ATTEMPTS}" ]]; then
      local wait_seconds
      wait_seconds="$(auth_backoff_seconds "${attempt}")"
      echo "WARN: ${label} ${action} rate-limited (HTTP 429). Retry ${attempt}/${AUTH_MAX_ATTEMPTS} in ${wait_seconds}s." >&2
      sleep "${wait_seconds}"
      continue
    fi

    if [[ "${status_code}" == "000" && "${attempt}" -lt "${AUTH_MAX_ATTEMPTS}" ]]; then
      local wait_seconds
      wait_seconds="$(auth_backoff_seconds "${attempt}")"
      echo "WARN: ${label} ${action} request failed (HTTP 000). Retry ${attempt}/${AUTH_MAX_ATTEMPTS} in ${wait_seconds}s." >&2
      sleep "${wait_seconds}"
      continue
    fi

    echo "${raw_response}"
    return 0
  done

  echo "${raw_response}"
  return 0
}

login_for_token() {
  local label="$1"
  local username="$2"
  local password="$3"

  if [[ -z "${username}" || -z "${password}" ]]; then
    echo "ERROR: Missing ${label} credentials." >&2
    echo "Set ${label}_USERNAME and ${label}_PASSWORD, or export ${label}_ACCESS_TOKEN." >&2
    return 1
  fi

  local payload
  payload="$(json_escape_login_payload "${username}" "${password}")"

  local raw_response
  raw_response="$(auth_request_with_retry "/auth/login" "${payload}" "${label}" "login")"

  local response_body="${raw_response%$'\n'*}"
  local status_code="${raw_response##*$'\n'}"

  if [[ "${status_code}" != "200" && "${status_code}" != "201" ]]; then
    echo "ERROR: ${label} login failed with HTTP ${status_code}." >&2
    echo "Response: ${response_body}" >&2
    return 1
  fi

  local token
  token="$(extract_access_token "${response_body}")"
  if [[ -z "${token}" ]]; then
    echo "ERROR: ${label} login response did not include accessToken." >&2
    echo "Response: ${response_body}" >&2
    return 1
  fi

  echo "${token}"
  return 0
}

register_for_token() {
  local label="$1"
  local username="$2"
  local email="$3"
  local password="$4"

  if [[ -z "${username}" || -z "${email}" || -z "${password}" ]]; then
    echo "ERROR: Missing ${label} registration fields." >&2
    return 1
  fi

  local payload
  payload="$(json_escape_register_payload "${username}" "${email}" "${password}")"

  local raw_response
  raw_response="$(auth_request_with_retry "/auth/register" "${payload}" "${label}" "register")"

  local response_body="${raw_response%$'\n'*}"
  local status_code="${raw_response##*$'\n'}"

  if [[ "${status_code}" != "200" && "${status_code}" != "201" ]]; then
    echo "ERROR: ${label} register failed with HTTP ${status_code}." >&2
    echo "Response: ${response_body}" >&2
    return 1
  fi

  local token
  token="$(extract_access_token "${response_body}")"
  if [[ -z "${token}" ]]; then
    echo "ERROR: ${label} register response did not include accessToken." >&2
    echo "Response: ${response_body}" >&2
    return 1
  fi

  echo "${token}"
  return 0
}

if ! command -v bru >/dev/null 2>&1; then
  echo "ERROR: Bruno CLI is not installed."
  echo "Install with: npm install -g @usebruno/cli"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required for token parsing and payload generation."
  echo "Install Node.js and retry."
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS --max-time 5 "${BASE_URL}/health" >/dev/null; then
    echo "ERROR: API health check failed at ${BASE_URL}/health"
    echo "Start API first, then retry: pnpm --filter @illamhelp/api dev"
    exit 1
  fi
fi

is_jwt_like() {
  local token="$1"
  if [[ ! "${token}" =~ ^[^.]+\.[^.]+\.[^.]+$ ]]; then
    return 1
  fi

  node -e '
    const token = process.argv[1];
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || signature === undefined) process.exit(1);
    try {
      const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (!parsedHeader.alg) process.exit(1);
    } catch {
      process.exit(1);
    }
  ' "${token}" >/dev/null 2>&1
}

load_cached_generated_users() {
  if [[ -f "${BRUNO_USER_CACHE_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${BRUNO_USER_CACHE_FILE}"
  fi
}

persist_cached_generated_users() {
  mkdir -p "$(dirname "${BRUNO_USER_CACHE_FILE}")"
  {
    printf "CACHED_SEEKER_USERNAME=%q\n" "${SEEKER_USERNAME:-}"
    printf "CACHED_SEEKER_PASSWORD=%q\n" "${SEEKER_PASSWORD:-}"
    printf "CACHED_SEEKER_EMAIL=%q\n" "${SEEKER_EMAIL:-}"
    printf "CACHED_PROVIDER_USERNAME=%q\n" "${PROVIDER_USERNAME:-}"
    printf "CACHED_PROVIDER_PASSWORD=%q\n" "${PROVIDER_PASSWORD:-}"
    printf "CACHED_PROVIDER_EMAIL=%q\n" "${PROVIDER_EMAIL:-}"
  } >"${BRUNO_USER_CACHE_FILE}"
}

load_cached_generated_users

if [[ "${BRUNO_PREFER_GENERATED_USERS}" == "true" ]]; then
  if [[ -z "${SEEKER_USERNAME}" && -z "${SEEKER_PASSWORD}" ]]; then
    SEEKER_TOKEN=""
  fi
  if [[ -z "${PROVIDER_USERNAME}" && -z "${PROVIDER_PASSWORD}" ]]; then
    PROVIDER_TOKEN=""
  fi
fi

if [[ -n "${SEEKER_TOKEN}" ]] && ! is_jwt_like "${SEEKER_TOKEN}"; then
  echo "WARN: existing SEEKER_ACCESS_TOKEN is invalid format; acquiring fresh token."
  SEEKER_TOKEN=""
fi

if [[ -n "${PROVIDER_TOKEN}" ]] && ! is_jwt_like "${PROVIDER_TOKEN}"; then
  echo "WARN: existing PROVIDER_ACCESS_TOKEN is invalid format; acquiring fresh token."
  PROVIDER_TOKEN=""
fi

if [[ -n "${ADMIN_TOKEN}" ]] && ! is_jwt_like "${ADMIN_TOKEN}"; then
  echo "WARN: existing ADMIN_ACCESS_TOKEN is invalid format; acquiring fresh token."
  ADMIN_TOKEN=""
fi

if [[ -n "${SEEKER_TOKEN}" ]]; then
  seeker_status_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${SEEKER_TOKEN}" \
      "${BASE_URL}/auth/me" || true
  )"
  if [[ "${seeker_status_code}" != "200" ]]; then
    echo "WARN: existing SEEKER_ACCESS_TOKEN rejected with HTTP ${seeker_status_code}; acquiring fresh token."
    SEEKER_TOKEN=""
  fi
fi

if [[ -n "${PROVIDER_TOKEN}" ]]; then
  provider_status_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${PROVIDER_TOKEN}" \
      "${BASE_URL}/auth/me" || true
  )"
  if [[ "${provider_status_code}" != "200" ]]; then
    echo "WARN: existing PROVIDER_ACCESS_TOKEN rejected with HTTP ${provider_status_code}; acquiring fresh token."
    PROVIDER_TOKEN=""
  fi
fi

if [[ -n "${ADMIN_TOKEN}" ]]; then
  admin_status_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "${BASE_URL}/auth/me" || true
  )"
  if [[ "${admin_status_code}" != "200" ]]; then
    echo "WARN: existing ADMIN_ACCESS_TOKEN rejected with HTTP ${admin_status_code}; acquiring fresh token."
    ADMIN_TOKEN=""
  fi
fi

if [[ -z "${SEEKER_TOKEN}" ]]; then
  if [[ -n "${SEEKER_USERNAME}" && -n "${SEEKER_PASSWORD}" ]]; then
    SEEKER_TOKEN="$(login_for_token "SEEKER" "${SEEKER_USERNAME}" "${SEEKER_PASSWORD}")"
  elif [[ -z "${SEEKER_USERNAME}" && -z "${SEEKER_PASSWORD}" ]]; then
    if [[ -n "${CACHED_SEEKER_USERNAME:-}" && -n "${CACHED_SEEKER_PASSWORD:-}" ]]; then
      SEEKER_USERNAME="${CACHED_SEEKER_USERNAME}"
      SEEKER_PASSWORD="${CACHED_SEEKER_PASSWORD}"
      SEEKER_EMAIL="${SEEKER_EMAIL:-${CACHED_SEEKER_EMAIL:-}}"
      if ! SEEKER_TOKEN="$(login_for_token "SEEKER" "${SEEKER_USERNAME}" "${SEEKER_PASSWORD}")"; then
        SEEKER_TOKEN=""
      fi
    fi

    if [[ -z "${SEEKER_TOKEN}" ]]; then
      seeker_identity="$(generate_random_identity "seeker")"
      SEEKER_USERNAME="$(printf "%s\n" "${seeker_identity}" | sed -n '1p')"
      SEEKER_PASSWORD="$(printf "%s\n" "${seeker_identity}" | sed -n '2p')"
      SEEKER_EMAIL="${SEEKER_EMAIL:-$(printf "%s\n" "${seeker_identity}" | sed -n '3p')}"
      SEEKER_TOKEN="$(
        register_for_token \
          "SEEKER" \
          "${SEEKER_USERNAME}" \
          "${SEEKER_EMAIL}" \
          "${SEEKER_PASSWORD}"
      )"
    fi
  else
    echo "ERROR: Provide both SEEKER_USERNAME and SEEKER_PASSWORD, or neither."
    exit 1
  fi
fi

if [[ -z "${PROVIDER_TOKEN}" ]]; then
  if [[ -n "${PROVIDER_USERNAME}" && -n "${PROVIDER_PASSWORD}" ]]; then
    PROVIDER_TOKEN="$(login_for_token "PROVIDER" "${PROVIDER_USERNAME}" "${PROVIDER_PASSWORD}")"
  elif [[ -z "${PROVIDER_USERNAME}" && -z "${PROVIDER_PASSWORD}" ]]; then
    if [[ -n "${CACHED_PROVIDER_USERNAME:-}" && -n "${CACHED_PROVIDER_PASSWORD:-}" ]]; then
      PROVIDER_USERNAME="${CACHED_PROVIDER_USERNAME}"
      PROVIDER_PASSWORD="${CACHED_PROVIDER_PASSWORD}"
      PROVIDER_EMAIL="${PROVIDER_EMAIL:-${CACHED_PROVIDER_EMAIL:-}}"
      if ! PROVIDER_TOKEN="$(login_for_token "PROVIDER" "${PROVIDER_USERNAME}" "${PROVIDER_PASSWORD}")"; then
        PROVIDER_TOKEN=""
      fi
    fi

    if [[ -z "${PROVIDER_TOKEN}" ]]; then
      provider_identity="$(generate_random_identity "provider")"
      PROVIDER_USERNAME="$(printf "%s\n" "${provider_identity}" | sed -n '1p')"
      PROVIDER_PASSWORD="$(printf "%s\n" "${provider_identity}" | sed -n '2p')"
      PROVIDER_EMAIL="${PROVIDER_EMAIL:-$(printf "%s\n" "${provider_identity}" | sed -n '3p')}"
      PROVIDER_TOKEN="$(
        register_for_token \
          "PROVIDER" \
          "${PROVIDER_USERNAME}" \
          "${PROVIDER_EMAIL}" \
          "${PROVIDER_PASSWORD}"
      )"
    fi
  else
    echo "ERROR: Provide both PROVIDER_USERNAME and PROVIDER_PASSWORD, or neither."
    exit 1
  fi
fi

if [[ "${BRUNO_REQUIRE_ADMIN}" == "true" && -z "${ADMIN_TOKEN}" ]]; then
  if [[ -n "${ADMIN_USERNAME}" && -n "${ADMIN_PASSWORD}" ]]; then
    ADMIN_TOKEN="$(login_for_token "ADMIN" "${ADMIN_USERNAME}" "${ADMIN_PASSWORD}")"
  else
    echo "ERROR: Missing admin credentials for Bruno admin E2E flow." >&2
    echo "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD, or provide ADMIN_ACCESS_TOKEN." >&2
    echo "Recommended: run through wrapper: bash ./scripts/run-with-e2e-admin-env.sh bash ./scripts/run-bruno-e2e.sh" >&2
    exit 1
  fi
fi

persist_cached_generated_users

export SEEKER_ACCESS_TOKEN="${SEEKER_TOKEN}"
export PROVIDER_ACCESS_TOKEN="${PROVIDER_TOKEN}"
export ADMIN_ACCESS_TOKEN="${ADMIN_TOKEN}"

if [[ ! -f "${COLLECTION_DIR}/bruno.json" ]]; then
  echo "ERROR: Invalid Bruno collection directory: ${COLLECTION_DIR}"
  echo "Expected file not found: ${COLLECTION_DIR}/bruno.json"
  exit 1
fi

if [[ ! -d "${COLLECTION_DIR}/${RUN_TARGET}" ]]; then
  echo "ERROR: Run target folder not found: ${COLLECTION_DIR}/${RUN_TARGET}"
  exit 1
fi

echo "Running Bruno E2E flow (env: ${ENV_NAME})"
echo "Collection root: ${COLLECTION_DIR}"
echo "Run target: ${RUN_TARGET} (recursive)"
echo "Tags filter: ${RUN_TAGS}"
echo "Base URL: ${BASE_URL}"
if [[ "${BRUNO_PRINT_EXPORTS}" == "true" ]]; then
  echo "Export commands for current terminal:"
  echo "export SEEKER_USERNAME='${SEEKER_USERNAME}'"
  echo "export SEEKER_PASSWORD='${SEEKER_PASSWORD}'"
  echo "export SEEKER_EMAIL='${SEEKER_EMAIL}'"
  echo "export PROVIDER_USERNAME='${PROVIDER_USERNAME}'"
  echo "export PROVIDER_PASSWORD='${PROVIDER_PASSWORD}'"
  echo "export PROVIDER_EMAIL='${PROVIDER_EMAIL}'"
  echo "export SEEKER_ACCESS_TOKEN='${SEEKER_TOKEN}'"
  echo "export PROVIDER_ACCESS_TOKEN='${PROVIDER_TOKEN}'"
  echo "export E2E_ADMIN_USERNAME='${ADMIN_USERNAME}'"
  echo "export E2E_ADMIN_PASSWORD='${ADMIN_PASSWORD}'"
  echo "export ADMIN_ACCESS_TOKEN='${ADMIN_TOKEN}'"
fi

if [[ "${BRUNO_LOGIN_ONLY}" == "true" ]]; then
  echo "Token login-only mode completed."
  exit 0
fi

(
  cd "${COLLECTION_DIR}"
  bru run "${RUN_TARGET}" -r \
    --tags "${RUN_TAGS}" \
    --env "${ENV_NAME}" \
    --env-var "baseUrl=${BASE_URL}" \
    --env-var "seekerAccessToken=${SEEKER_TOKEN}" \
    --env-var "providerAccessToken=${PROVIDER_TOKEN}" \
    --env-var "adminAccessToken=${ADMIN_TOKEN}"
)

echo "Bruno E2E completed."

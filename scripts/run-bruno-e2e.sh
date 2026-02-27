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

SEEKER_TOKEN="${SEEKER_ACCESS_TOKEN:-}"
PROVIDER_TOKEN="${PROVIDER_ACCESS_TOKEN:-}"
SEEKER_USERNAME="${SEEKER_USERNAME:-}"
SEEKER_PASSWORD="${SEEKER_PASSWORD:-}"
PROVIDER_USERNAME="${PROVIDER_USERNAME:-}"
PROVIDER_PASSWORD="${PROVIDER_PASSWORD:-}"
SEEKER_EMAIL="${SEEKER_EMAIL:-}"
PROVIDER_EMAIL="${PROVIDER_EMAIL:-}"

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

login_for_token() {
  local label="$1"
  local username="$2"
  local password="$3"

  if [[ -z "${username}" || -z "${password}" ]]; then
    echo "ERROR: Missing ${label} credentials."
    echo "Set ${label}_USERNAME and ${label}_PASSWORD, or export ${label}_ACCESS_TOKEN."
    exit 1
  fi

  local payload
  payload="$(json_escape_login_payload "${username}" "${password}")"

  local raw_response
  raw_response="$(
    curl -sS -X POST "${BASE_URL}/auth/login" \
      -H "Content-Type: application/json" \
      --data "${payload}" \
      -w $'\n%{http_code}'
  )"

  local response_body="${raw_response%$'\n'*}"
  local status_code="${raw_response##*$'\n'}"

  if [[ "${status_code}" != "200" && "${status_code}" != "201" ]]; then
    echo "ERROR: ${label} login failed with HTTP ${status_code}."
    echo "Response: ${response_body}"
    exit 1
  fi

  local token
  token="$(extract_access_token "${response_body}")"
  if [[ -z "${token}" ]]; then
    echo "ERROR: ${label} login response did not include accessToken."
    echo "Response: ${response_body}"
    exit 1
  fi

  echo "${token}"
}

register_for_token() {
  local label="$1"
  local username="$2"
  local email="$3"
  local password="$4"

  if [[ -z "${username}" || -z "${email}" || -z "${password}" ]]; then
    echo "ERROR: Missing ${label} registration fields."
    exit 1
  fi

  local payload
  payload="$(json_escape_register_payload "${username}" "${email}" "${password}")"

  local raw_response
  raw_response="$(
    curl -sS -X POST "${BASE_URL}/auth/register" \
      -H "Content-Type: application/json" \
      --data "${payload}" \
      -w $'\n%{http_code}'
  )"

  local response_body="${raw_response%$'\n'*}"
  local status_code="${raw_response##*$'\n'}"

  if [[ "${status_code}" != "200" && "${status_code}" != "201" ]]; then
    echo "ERROR: ${label} register failed with HTTP ${status_code}."
    echo "Response: ${response_body}"
    exit 1
  fi

  local token
  token="$(extract_access_token "${response_body}")"
  if [[ -z "${token}" ]]; then
    echo "ERROR: ${label} register response did not include accessToken."
    echo "Response: ${response_body}"
    exit 1
  fi

  echo "${token}"
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

if [[ -z "${SEEKER_TOKEN}" ]]; then
  if [[ -n "${SEEKER_USERNAME}" && -n "${SEEKER_PASSWORD}" ]]; then
    SEEKER_TOKEN="$(login_for_token "SEEKER" "${SEEKER_USERNAME}" "${SEEKER_PASSWORD}")"
  elif [[ -z "${SEEKER_USERNAME}" && -z "${SEEKER_PASSWORD}" ]]; then
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
  else
    echo "ERROR: Provide both SEEKER_USERNAME and SEEKER_PASSWORD, or neither."
    exit 1
  fi
fi

if [[ -z "${PROVIDER_TOKEN}" ]]; then
  if [[ -n "${PROVIDER_USERNAME}" && -n "${PROVIDER_PASSWORD}" ]]; then
    PROVIDER_TOKEN="$(login_for_token "PROVIDER" "${PROVIDER_USERNAME}" "${PROVIDER_PASSWORD}")"
  elif [[ -z "${PROVIDER_USERNAME}" && -z "${PROVIDER_PASSWORD}" ]]; then
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
  else
    echo "ERROR: Provide both PROVIDER_USERNAME and PROVIDER_PASSWORD, or neither."
    exit 1
  fi
fi

export SEEKER_ACCESS_TOKEN="${SEEKER_TOKEN}"
export PROVIDER_ACCESS_TOKEN="${PROVIDER_TOKEN}"

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
    --env-var "providerAccessToken=${PROVIDER_TOKEN}"
)

echo "Bruno E2E completed."

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]"
  exit 1
fi

FLOW_SEED="${MAESTRO_FLOW_SEED:-$(date +%s)$RANDOM}"
DEFAULT_PASSWORD="${MAESTRO_E2E_PASSWORD:-StrongPass#2026}"

phone_suffix() {
  local input="$1"
  printf '%010d' "$(( (10#${input:0:6} * 97 + 13) % 10000000000 ))"
}

generate_user() {
  local prefix="$1"
  local stem="$2"
  local seed="$3"
  local phone
  local stem_lower
  phone="$(phone_suffix "$seed")"
  stem_lower="$(printf '%s' "$stem" | tr '[:upper:]' '[:lower:]')"
  printf -v "${prefix}_FIRST_NAME" '%s' "${stem}"
  printf -v "${prefix}_LAST_NAME" '%s' 'E2E'
  printf -v "${prefix}_EMAIL" '%s' "${stem_lower}_${seed}@example.com"
  printf -v "${prefix}_USERNAME" '%s' "${stem_lower}_${seed}"
  printf -v "${prefix}_PHONE" '%s' "+91${phone}"
  printf -v "${prefix}_PASSWORD" '%s' "$DEFAULT_PASSWORD"
  export "${prefix}_FIRST_NAME" "${prefix}_LAST_NAME" "${prefix}_EMAIL" "${prefix}_USERNAME" "${prefix}_PHONE" "${prefix}_PASSWORD"
}

generate_user AUTH_MEMBER AuthMember "${FLOW_SEED}01"
generate_user NAV_MEMBER NavMember "${FLOW_SEED}02"
generate_user JOBS_SEEKER JobsSeeker "${FLOW_SEED}03"
generate_user JOBS_PROVIDER JobsProvider "${FLOW_SEED}04"
generate_user CONNECTIONS_OWNER ConnectionsOwner "${FLOW_SEED}05"
generate_user CONNECTIONS_REQUESTER ConnectionsRequester "${FLOW_SEED}06"
generate_user ALERTS_OWNER AlertsOwner "${FLOW_SEED}07"
generate_user ALERTS_REQUESTER AlertsRequester "${FLOW_SEED}08"
generate_user PRIVACY_OWNER PrivacyOwner "${FLOW_SEED}09"
generate_user PRIVACY_REQUESTER PrivacyRequester "${FLOW_SEED}10"
generate_user PROFILE_MEMBER ProfileMember "${FLOW_SEED}11"
generate_user VERIFY_MEMBER VerifyMember "${FLOW_SEED}12"

export APP_ID="${MAESTRO_APP_ID:-com.anonymous.illamhelp}"
export MAESTRO_JOBS_TITLE="Maestro posted ${FLOW_SEED}"
export MAESTRO_JOBS_DESCRIPTION="Need support for leaking sink valve replacement and pressure checks."
export MAESTRO_JOBS_LOCATION="Kakkanad, Kochi"
export MAESTRO_PRIVACY_REQUEST_PURPOSE="Service coordination ${FLOW_SEED}"
export MAESTRO_PRIVACY_GRANT_PURPOSE="Approved temporary contact access ${FLOW_SEED}"
export MAESTRO_VERIFY_MEDIA_ID="11111111-1111-4111-8111-${FLOW_SEED:0:12}"
export MAESTRO_VERIFY_NOTES="Verification request ${FLOW_SEED} submitted from Maestro UI flow."

maestro_env_args=()

append_env_arg() {
  local key="$1"
  local value="${!key:-}"
  maestro_env_args+=("-e" "${key}=${value}")
}

append_env_arg APP_ID
append_env_arg MAESTRO_JOBS_TITLE
append_env_arg MAESTRO_JOBS_DESCRIPTION
append_env_arg MAESTRO_JOBS_LOCATION
append_env_arg MAESTRO_PRIVACY_REQUEST_PURPOSE
append_env_arg MAESTRO_PRIVACY_GRANT_PURPOSE
append_env_arg MAESTRO_VERIFY_MEDIA_ID
append_env_arg MAESTRO_VERIFY_NOTES

for prefix in AUTH_MEMBER NAV_MEMBER JOBS_SEEKER JOBS_PROVIDER CONNECTIONS_OWNER CONNECTIONS_REQUESTER ALERTS_OWNER ALERTS_REQUESTER PRIVACY_OWNER PRIVACY_REQUESTER PROFILE_MEMBER VERIFY_MEMBER; do
  append_env_arg "${prefix}_FIRST_NAME"
  append_env_arg "${prefix}_LAST_NAME"
  append_env_arg "${prefix}_EMAIL"
  append_env_arg "${prefix}_USERNAME"
  append_env_arg "${prefix}_PHONE"
  append_env_arg "${prefix}_PASSWORD"
done

if [[ "$#" -ge 2 && "$2" == "test" ]]; then
  maestro_cmd=("$1" "$2")
  shift 2
  exec "${maestro_cmd[@]}" "${maestro_env_args[@]}" "$@"
fi

exec "$@"

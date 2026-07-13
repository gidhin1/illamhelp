#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${K8S_NAMESPACE:-illamhelp}"
APP_RELEASE="${K8S_APP_RELEASE:-illamhelp-app}"
pids=()

cleanup() {
  trap - EXIT INT TERM
  if [[ ${#pids[@]} -gt 0 ]]; then
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

kubectl port-forward --namespace "$NAMESPACE" "service/${APP_RELEASE}-web" 3000:3000 &
pids+=("$!")
kubectl port-forward --namespace "$NAMESPACE" "service/${APP_RELEASE}-admin" 3003:3003 &
pids+=("$!")
kubectl port-forward --namespace "$NAMESPACE" "service/${APP_RELEASE}-api" 4000:4000 &
pids+=("$!")
kubectl port-forward --namespace "$NAMESPACE" "service/${APP_RELEASE}-envoy" 9091:9091 &
pids+=("$!")

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid"
      exit $?
    fi
  done
  sleep 1
done

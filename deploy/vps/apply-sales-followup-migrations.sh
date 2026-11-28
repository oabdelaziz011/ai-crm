#!/usr/bin/env bash
# Root-only Contabo helper: apply sales follow-up 421 + sales 470–480.
# Never prints DATABASE_URL or other secrets.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
MODE="${MODE:-apply}"
SEED_WORKER="${SEED_WORKER:-true}"
SEED_FOLLOW_UP="${SEED_FOLLOW_UP:-true}"
WORKER_NAME="${WORKER_NAME:-Omar Abdelaziz}"
WORKER_PHONE="${WORKER_PHONE:-+201011404109}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "apply-sales-followup-migrations.sh must run as root"
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file (path only): ${ENV_FILE}"
  exit 2
fi

APPLY_PY="${APP_DIR}/scripts/ops-remote-apply-sales-migrations.py"
MIG_DIR="${APP_DIR}/supabase/migrations"
if [[ ! -f "$APPLY_PY" ]]; then
  echo "Missing ${APPLY_PY}"
  exit 2
fi
if [[ ! -d "$MIG_DIR" ]]; then
  echo "Missing ${MIG_DIR}"
  exit 2
fi

DATABASE_URL="$(
  awk -F= '
    /^[[:space:]]*#/ {next}
    $1=="DATABASE_URL" {
      v=substr($0, index($0,"=")+1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"/, "", v); gsub(/"$/, "", v)
      gsub(/^'\''/, "", v); gsub(/'\''$/, "", v)
      print v
      exit
    }' "$ENV_FILE"
)"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "database_url=missing"
  exit 4
fi
echo "database_url=present len=${#DATABASE_URL}"
echo "mode=${MODE} seed_worker=${SEED_WORKER} seed_follow_up=${SEED_FOLLOW_UP}"

export DATABASE_URL
export MODE
export SEED_WORKER
export SEED_FOLLOW_UP
export WORKER_NAME
export WORKER_PHONE
export MIG_DIR

python3 "$APPLY_PY"
echo "migrations_apply=ok"

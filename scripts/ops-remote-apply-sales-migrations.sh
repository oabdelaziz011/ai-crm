#!/usr/bin/env bash
set -euo pipefail
REMOTE_DIR="${1:?remote dir}"
echo "host=$(hostname)"
echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "mode=${MODE:-inspect}"
echo "seed_worker=${SEED_WORKER:-false}"

resolve_database_url() {
  local f
  for f in /opt/valueor/.env /opt/valueor/deploy/vps/production.env; do
    if [[ -r "$f" ]]; then
      echo "env_source=$f" >&2
      awk -F= '
        /^[[:space:]]*#/ {next}
        $1=="DATABASE_URL" {
          v=substr($0, index($0,"=")+1)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
          gsub(/^"/, "", v); gsub(/"$/, "", v)
          gsub(/^'\''/, "", v); gsub(/'\''$/, "", v)
          print v
          exit
        }' "$f"
      return 0
    fi
    if command -v sudo >/dev/null 2>&1 && sudo -n test -r "$f" 2>/dev/null; then
      echo "env_source=sudo:$f" >&2
      sudo -n awk -F= '
        /^[[:space:]]*#/ {next}
        $1=="DATABASE_URL" {
          v=substr($0, index($0,"=")+1)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
          gsub(/^"/, "", v); gsub(/"$/, "", v)
          gsub(/^'\''/, "", v); gsub(/'\''$/, "", v)
          print v
          exit
        }' "$f"
      return 0
    fi
  done
  return 1
}

DATABASE_URL="$(resolve_database_url || true)"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "database_url=missing"
  ls -la /opt/valueor /opt/valueor/.env 2>&1 | head -n 40 || true
  id; groups || true
  exit 4
fi
echo "database_url=present len=${#DATABASE_URL}"
export DATABASE_URL
export MODE="${MODE:-inspect}"
export SEED_WORKER="${SEED_WORKER:-false}"
export SEED_FOLLOW_UP="${SEED_FOLLOW_UP:-false}"
export WORKER_NAME="${WORKER_NAME:-Omar Abdelaziz}"
export WORKER_PHONE="${WORKER_PHONE:-+201011404109}"
export MIG_DIR="${MIG_DIR:-$REMOTE_DIR/migrations}"
python3 "$REMOTE_DIR/remote_apply.py"
rm -rf "$REMOTE_DIR"
echo "cleanup=ok"

#!/usr/bin/env bash
# Idempotent Hetzner Nginx + systemd cutover helper.
# Never modifies DNS, Meta, Supabase SQL, or /opt/valueor/.env contents.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
API_PORT="${API_PORT:-3001}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
FRONTEND_SRC="${FRONTEND_SRC:-}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/valueor}"
STAGE="${1:-}"
CONFIRM_STOP=0

shift_args() {
  if [[ $# -gt 0 ]]; then shift; fi
}

usage() {
  cat <<'EOF'
Usage: sudo bash deploy/vps/deploy-production.sh <stage> [options]

Stages:
  preflight              Disk/memory/git/env-name/port checks. No changes.
  backup                 Backup Nginx sites and record PIDs owning API_PORT.
  install                Install Nginx templates + systemd unit; nginx -t; daemon-reload.
  publish-frontend       Publish FRONTEND_SRC into /var/www/valueor (keeps previous).
  handover               Stop ONLY the recorded API_PORT holder, then start systemd.
                         Requires --confirm-stop-port-holder.
  health                 Local and Host-header health/ready checks.
  status                 Show systemd/nginx/port status.
  rollback-service       Stop systemd and print restore hints for the prior process.
  help                   Show this help.

Options:
  --confirm-stop-port-holder   Required for handover.
  --expected-sha <sha>         Fail if /opt/valueor HEAD does not match.
  --frontend-src <dir>         Dist directory for publish-frontend.
  --api-port <port>            Default 3001.

Examples:
  sudo bash deploy/vps/deploy-production.sh preflight --expected-sha <sha>
  sudo bash deploy/vps/deploy-production.sh backup
  sudo bash deploy/vps/deploy-production.sh install
  sudo bash deploy/vps/deploy-production.sh publish-frontend --frontend-src /tmp/valueor-frontend
  sudo bash deploy/vps/deploy-production.sh handover --confirm-stop-port-holder
  sudo bash deploy/vps/deploy-production.sh health
EOF
}

ARGS=("$@")
i=0
while [[ $i -lt ${#ARGS[@]} ]]; do
  case "${ARGS[$i]}" in
    --confirm-stop-port-holder) CONFIRM_STOP=1 ;;
    --expected-sha)
      i=$((i + 1)); EXPECTED_SHA="${ARGS[$i]:-}" ;;
    --frontend-src)
      i=$((i + 1)); FRONTEND_SRC="${ARGS[$i]:-}" ;;
    --api-port)
      i=$((i + 1)); API_PORT="${ARGS[$i]:-}" ;;
    help|-h|--help) usage; exit 0 ;;
    preflight|backup|install|publish-frontend|handover|health|status|rollback-service)
      STAGE="${ARGS[$i]}"
      ;;
    *)
      if [[ -z "$STAGE" ]]; then STAGE="${ARGS[$i]}"; fi
      ;;
  esac
  i=$((i + 1))
done

if [[ -z "$STAGE" || "$STAGE" == "help" ]]; then
  usage
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_ROOT}/${stamp}"
pid_file="${BACKUP_ROOT}/api-port-${API_PORT}.pids"

require_file() {
  local path="$1"
  [[ -f "$path" ]] || { echo "Missing file: $path" >&2; exit 2; }
}

env_names_present() {
  local env_file="$1"
  local missing=0
  local required=(
    VALUEOR_ENV NODE_ENV SESSION_SECRET INTERNAL_API_KEY
    SUPABASE_URL VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
    VITE_API_SERVER_URL WEBHOOK_BASE_URL VITE_WEBHOOK_BASE_URL PUBLIC_WEBHOOK_BASE_URL
  )
  local frontend_any=0
  for key in "${required[@]}"; do
    if ! grep -E "^${key}=" "$env_file" >/dev/null 2>&1; then
      echo "missing env name: ${key}"
      missing=1
    fi
  done
  for key in VITE_APP_ORIGIN FRONTEND_ORIGIN VITE_SITE_URL; do
    if grep -E "^${key}=" "$env_file" >/dev/null 2>&1; then
      frontend_any=1
    fi
  done
  if [[ "$frontend_any" -eq 0 ]]; then
    echo "missing env name: one of VITE_APP_ORIGIN/FRONTEND_ORIGIN/VITE_SITE_URL"
    missing=1
  fi
  if ! grep -E "^DATABASE_URL=" "$env_file" >/dev/null 2>&1; then
    for key in SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF SUPABASE_REGION; do
      if ! grep -E "^${key}=" "$env_file" >/dev/null 2>&1; then
        echo "missing env name: DATABASE_URL or ${key}"
        missing=1
      fi
    done
  fi
  return "$missing"
}

stage_preflight() {
  echo "== preflight =="
  require_file "${APP_DIR}/deploy/vps/systemd/valueor-api.service"
  require_file "${APP_DIR}/deploy/vps/nginx/valueor-api.conf"
  require_file "${APP_DIR}/deploy/vps/nginx/valueor-frontend.conf"
  require_file "${APP_DIR}/deploy/vps/start-api.mjs"
  require_file /etc/nginx/ssl/origin-cert.pem
  require_file /etc/nginx/ssl/origin-key.pem
  require_file "${APP_DIR}/.env"
  require_file /usr/bin/node

  local sha
  sha="$(git -C "${APP_DIR}" rev-parse HEAD)"
  echo "git_sha=${sha}"
  if [[ -n "$EXPECTED_SHA" && "$sha" != "$EXPECTED_SHA" && "$sha" != "${EXPECTED_SHA:0:40}" ]]; then
    echo "Git SHA mismatch. expected=${EXPECTED_SHA} actual=${sha}" >&2
    exit 2
  fi

  echo "node=$(/usr/bin/node -v)"
  df -h / /opt /var/www 2>/dev/null || df -h /
  free -m || true

  echo "== env names (no values) =="
  if ! env_names_present "${APP_DIR}/.env"; then
    echo "Production env name check failed." >&2
    exit 2
  fi
  echo "env name check passed"

  echo "== port ${API_PORT} holders =="
  ss -ltnp "( sport = :${API_PORT} )" || true
  curl -fsS "http://127.0.0.1:${API_PORT}/api/healthz" && echo || echo "healthz on :${API_PORT} not reachable"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/readyz" && echo || echo "readyz on :${API_PORT} not reachable"
}

stage_backup() {
  echo "== backup =="
  mkdir -p "$backup_dir"
  mkdir -p "$BACKUP_ROOT"
  if [[ -f /etc/nginx/sites-available/valueor-api ]]; then
    cp -a /etc/nginx/sites-available/valueor-api "$backup_dir/"
  fi
  if [[ -f /etc/nginx/sites-available/valueor ]]; then
    cp -a /etc/nginx/sites-available/valueor "$backup_dir/"
  fi
  ss -ltnp "( sport = :${API_PORT} )" >"${backup_dir}/port-${API_PORT}.ss.txt" || true
  : >"$pid_file"
  ss -ltnp "( sport = :${API_PORT} )" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u >"$pid_file" || true
  cp -a "$pid_file" "$backup_dir/"
  git -C "${APP_DIR}" rev-parse HEAD >"${backup_dir}/git-sha.txt"
  echo "backup_dir=${backup_dir}"
  echo "pid_file=${pid_file}"
  cat "$pid_file" || true
}

stage_install() {
  echo "== install nginx + systemd =="
  install -m 0644 "${APP_DIR}/deploy/vps/nginx/valueor-api.conf" /etc/nginx/sites-available/valueor-api
  install -m 0644 "${APP_DIR}/deploy/vps/nginx/valueor-frontend.conf" /etc/nginx/sites-available/valueor
  ln -sfn /etc/nginx/sites-available/valueor-api /etc/nginx/sites-enabled/valueor-api
  ln -sfn /etc/nginx/sites-available/valueor /etc/nginx/sites-enabled/valueor
  nginx -t
  install -m 0644 "${APP_DIR}/deploy/vps/systemd/valueor-api.service" /etc/systemd/system/valueor-api.service
  systemctl daemon-reload
  echo "install complete (service not started)"
}

stage_publish_frontend() {
  echo "== publish frontend =="
  [[ -n "$FRONTEND_SRC" ]] || { echo "--frontend-src is required" >&2; exit 2; }
  [[ -d "$FRONTEND_SRC" ]] || { echo "frontend src missing: $FRONTEND_SRC" >&2; exit 2; }
  [[ -f "${FRONTEND_SRC}/index.html" ]] || { echo "frontend src missing index.html" >&2; exit 2; }
  mkdir -p /var/www
  if [[ -d /var/www/valueor ]]; then
    rm -rf /var/www/valueor.previous
    mv /var/www/valueor /var/www/valueor.previous
  fi
  mkdir -p /var/www/valueor
  cp -a "${FRONTEND_SRC}/." /var/www/valueor/
  if [[ -f "${APP_DIR}/scripts/verify-frontend-production-bundle.mjs" ]]; then
    /usr/bin/node "${APP_DIR}/scripts/verify-frontend-production-bundle.mjs" /var/www/valueor
  fi
  echo "frontend published to /var/www/valueor"
}

stage_handover() {
  echo "== handover =="
  if [[ "$CONFIRM_STOP" -ne 1 ]]; then
    echo "Refusing handover without --confirm-stop-port-holder" >&2
    exit 2
  fi
  if systemctl is-active --quiet valueor-api.service; then
    echo "valueor-api.service already active"
  else
    mapfile -t pids < <(ss -ltnp "( sport = :${API_PORT} )" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
    if [[ ${#pids[@]} -gt 0 ]]; then
      echo "Stopping recorded port holders: ${pids[*]}"
      for pid in "${pids[@]}"; do
        if [[ -r "/proc/${pid}/cmdline" ]]; then
          tr '\0' ' ' <"/proc/${pid}/cmdline"; echo
        fi
        kill -TERM "$pid" || true
      done
      sleep 3
      mapfile -t still < <(ss -ltnp "( sport = :${API_PORT} )" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
      if [[ ${#still[@]} -gt 0 ]]; then
        echo "Port ${API_PORT} still held by: ${still[*]}" >&2
        exit 2
      fi
    fi
    systemctl enable --now valueor-api.service
  fi
  systemctl --no-pager --full status valueor-api.service || true
}

stage_health() {
  echo "== health =="
  systemctl is-active valueor-api.service
  curl -fsS "http://127.0.0.1:${API_PORT}/api/healthz"; echo
  curl -fsS "http://127.0.0.1:${API_PORT}/api/readyz"; echo
  curl --resolve api.valueor.org:443:127.0.0.1 -fsS https://api.valueor.org/api/healthz; echo
  curl --resolve webhook.valueor.org:443:127.0.0.1 -fsS https://webhook.valueor.org/api/healthz; echo
  if [[ -d /var/www/valueor ]]; then
    curl --resolve www.valueor.org:443:127.0.0.1 -fsS -o /dev/null -w "www_local_https=%{http_code}\n" https://www.valueor.org/ || true
  fi
}

stage_status() {
  systemctl --no-pager --full status valueor-api.service || true
  systemctl --no-pager --full status nginx || true
  ss -ltnp "( sport = :${API_PORT} )" || true
  ss -ltnp 'sport = :443' || true
}

stage_rollback_service() {
  echo "== rollback-service =="
  systemctl stop valueor-api.service || true
  systemctl disable valueor-api.service || true
  echo "systemd stopped. Restore the previous Node process manually using the PID notes in ${BACKUP_ROOT}."
  echo "Example restart (adjust to the recorded command):"
  echo "  cd ${APP_DIR}/artifacts/api-server"
  echo "  VALUEOR_ENV=production NODE_ENV=production PORT=${API_PORT} EMAIL_POLL_WORKER_ENABLED=false SESSION_IDLE_TIMEOUT_WORKER_ENABLED=false node ./scripts/start-with-env.mjs"
  if [[ -d /var/www/valueor.previous ]]; then
    echo "Frontend previous copy exists at /var/www/valueor.previous"
  fi
  if [[ -d "$BACKUP_ROOT" ]]; then
    echo "Nginx backups under ${BACKUP_ROOT}"
  fi
}

case "$STAGE" in
  preflight) stage_preflight ;;
  backup) stage_backup ;;
  install) stage_install ;;
  publish-frontend) stage_publish_frontend ;;
  handover) stage_handover ;;
  health) stage_health ;;
  status) stage_status ;;
  rollback-service) stage_rollback_service ;;
  *) usage; exit 2 ;;
esac

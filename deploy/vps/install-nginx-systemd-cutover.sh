#!/usr/bin/env bash
# Idempotent VPS-local install of Nginx site templates and the valueor-api systemd unit.
# Does not change DNS, Meta, Supabase, or Cloudflare.
# Does not stop a process unless --confirm-stop-port-holder is passed after preflight passes.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
UNIT_SRC="${APP_DIR}/deploy/vps/systemd/valueor-api.service"
UNIT_DST=/etc/systemd/system/valueor-api.service
NGINX_API_SRC="${APP_DIR}/deploy/vps/nginx/valueor-api.conf"
NGINX_FE_SRC="${APP_DIR}/deploy/vps/nginx/valueor-frontend.conf"
NGINX_API_DST=/etc/nginx/sites-available/valueor-api
NGINX_FE_DST=/etc/nginx/sites-available/valueor
API_PORT="${API_PORT:-3001}"
CONFIRM_STOP=0
INSTALL_ONLY=0

usage() {
  cat <<'EOF'
Usage: sudo bash deploy/vps/install-nginx-systemd-cutover.sh [options]

  --install-only              Copy unit/Nginx files, daemon-reload, nginx -t. Do not start/stop processes.
  --confirm-stop-port-holder  After preflight, stop whatever currently owns PORT (default 3001), then start systemd.
  -h, --help                  Show this help.

Environment:
  APP_DIR   Repository root on the VPS (default /opt/valueor)
  API_PORT  Upstream port expected by Nginx (default 3001)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-only) INSTALL_ONLY=1; shift ;;
    --confirm-stop-port-holder) CONFIRM_STOP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 2
fi

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 2
  fi
}

require_file "$UNIT_SRC"
require_file "$NGINX_API_SRC"
require_file "$NGINX_FE_SRC"
require_file /etc/nginx/ssl/origin-cert.pem
require_file /etc/nginx/ssl/origin-key.pem

if [[ ! -f "${APP_DIR}/.env" && ! -f "${APP_DIR}/deploy/vps/production.env" ]]; then
  echo "Missing ${APP_DIR}/.env (or deploy/vps/production.env). Refusing to continue." >&2
  exit 2
fi

if [[ ! -x /usr/bin/node ]]; then
  echo "/usr/bin/node is missing. Adjust the unit ExecStart after installing Node." >&2
  exit 2
fi

echo "== Preflight =="
echo "APP_DIR=${APP_DIR}"
echo "git=$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "node=$(/usr/bin/node -v)"
ss -ltnp "( sport = :${API_PORT} )" || true
curl -fsS "http://127.0.0.1:${API_PORT}/api/healthz" || echo "current :${API_PORT} healthz not reachable"

echo "== Install Nginx templates =="
install -m 0644 "$NGINX_API_SRC" "$NGINX_API_DST"
install -m 0644 "$NGINX_FE_SRC" "$NGINX_FE_DST"
ln -sfn "$NGINX_API_DST" /etc/nginx/sites-enabled/valueor-api
ln -sfn "$NGINX_FE_DST" /etc/nginx/sites-enabled/valueor
nginx -t

echo "== Install systemd unit =="
install -m 0644 "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload

if [[ "$INSTALL_ONLY" -eq 1 ]]; then
  echo "Install-only complete. Review the unit, then start with:"
  echo "  systemctl enable --now valueor-api.service"
  echo "Only after confirming nothing else must keep PORT ${API_PORT}."
  exit 0
fi

if [[ "$CONFIRM_STOP" -ne 1 ]]; then
  echo "Files installed. Refusing to stop/start processes without --confirm-stop-port-holder."
  echo "Next: sudo bash $0 --confirm-stop-port-holder"
  exit 0
fi

echo "== Confirmation gate: stop port holder and start systemd =="
if systemctl is-active --quiet valueor-api.service; then
  echo "valueor-api.service is already active."
else
  if ss -ltn "( sport = :${API_PORT} )" | grep -q ":${API_PORT}"; then
    echo "PORT ${API_PORT} is in use. Stopping holders with SIGTERM (manual Node processes)."
    # shellcheck disable=SC2046
    pids=$(ss -ltnp "( sport = :${API_PORT} )" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
    if [[ -z "${pids}" ]]; then
      echo "Could not resolve PIDs for PORT ${API_PORT}. Stop them manually, then re-run." >&2
      exit 2
    fi
    kill -TERM ${pids} || true
    sleep 3
  fi
  systemctl enable --now valueor-api.service
fi

systemctl --no-pager --full status valueor-api.service || true
curl -fsS "http://127.0.0.1:${API_PORT}/api/healthz"
curl -fsS "http://127.0.0.1:${API_PORT}/api/readyz"
systemctl reload nginx
echo "Cutover local install finished. DNS and Meta remain manual."

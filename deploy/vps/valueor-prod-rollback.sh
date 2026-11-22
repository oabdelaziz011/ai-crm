#!/usr/bin/env bash
# Narrow entrypoint for the self-hosted Actions runner.
# Must be installed as root-owned /usr/local/sbin/valueor-prod-rollback.
# Invoked via: sudo -n /usr/local/sbin/valueor-prod-rollback
set -euo pipefail

APP_DIR=/opt/valueor
APP_USER=valueor

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This wrapper must run as root (via sudo from gha-runner)."
  exit 2
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing application user: $APP_USER"
  exit 2
fi

if [[ ! -f "$APP_DIR/deploy/vps/remote-rollback.sh" ]]; then
  echo "Missing $APP_DIR/deploy/vps/remote-rollback.sh"
  exit 2
fi

exec runuser -u "$APP_USER" -- /bin/bash "$APP_DIR/deploy/vps/remote-rollback.sh"

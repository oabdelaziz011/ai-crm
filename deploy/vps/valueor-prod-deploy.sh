#!/usr/bin/env bash
# Narrow entrypoint for the self-hosted Actions runner.
# Must be installed as root-owned /usr/local/sbin/valueor-prod-deploy.
# Invoked via: sudo -n /usr/local/sbin/valueor-prod-deploy <40-char-sha>
set -euo pipefail

APP_DIR=/opt/valueor
APP_USER=valueor
SHA="${1:?git sha required}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This wrapper must run as root (via sudo from gha-runner)."
  exit 2
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing application user: $APP_USER"
  exit 2
fi

if [[ ! -x "$APP_DIR/deploy/vps/remote-deploy.sh" && ! -f "$APP_DIR/deploy/vps/remote-deploy.sh" ]]; then
  echo "Missing $APP_DIR/deploy/vps/remote-deploy.sh"
  exit 2
fi

# Drop privileges to the app user; never source production.env here.
exec runuser -u "$APP_USER" -- /bin/bash "$APP_DIR/deploy/vps/remote-deploy.sh" "$SHA"

#!/usr/bin/env bash
# Narrow root entrypoint for the Contabo self-hosted Actions runner.
# Install as root-owned /usr/local/sbin/valueor-prod-rollback (mode 0750).
# Invoked via: sudo -n /usr/local/sbin/valueor-prod-rollback
#
# Permanent production topology: Nginx + systemd + release directory rollback.
# Does not call Compose remote-rollback.sh.
set -euo pipefail

APP_DIR=/opt/valueor

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This wrapper must run as root (via sudo -n from gha-runner)."
  exit 2
fi

if [[ ! -f "$APP_DIR/deploy/vps/systemd-release-rollback.sh" ]]; then
  echo "Missing $APP_DIR/deploy/vps/systemd-release-rollback.sh"
  exit 2
fi

exec /bin/bash "$APP_DIR/deploy/vps/systemd-release-rollback.sh"

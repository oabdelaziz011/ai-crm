#!/usr/bin/env bash
# Narrow root entrypoint for the Contabo self-hosted Actions runner.
# Install as root-owned /usr/local/sbin/valueor-prod-deploy (mode 0750).
# Invoked via: sudo -n /usr/local/sbin/valueor-prod-deploy <40-char-sha>
#
# Permanent production topology: Nginx + systemd + /opt/valueor-releases.
# Does not call Compose remote-deploy.sh.
set -euo pipefail

APP_DIR=/opt/valueor
SHA="${1:?git sha required}"
ARTIFACTS_DIR="${2:-/var/lib/valueor/incoming/${SHA}}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This wrapper must run as root (via sudo -n from gha-runner)."
  exit 2
fi

if [[ ! -f "$APP_DIR/deploy/vps/systemd-release-deploy.sh" ]]; then
  echo "Missing $APP_DIR/deploy/vps/systemd-release-deploy.sh"
  exit 2
fi

# Heal executable-bit drift on migration helper before dirty check in deploy script.
if [[ -f "$APP_DIR/deploy/vps/apply-sales-followup-migrations.sh" ]]; then
  git -C "$APP_DIR" checkout -- deploy/vps/apply-sales-followup-migrations.sh 2>/dev/null || true
fi

export VALUEOR_ARTIFACTS_DIR="$ARTIFACTS_DIR"
exec /bin/bash "$APP_DIR/deploy/vps/systemd-release-deploy.sh" "$SHA"

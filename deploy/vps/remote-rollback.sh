#!/usr/bin/env bash
# NON-PRODUCTION / Compose-lab only.
# Contabo production MUST use deploy/vps/systemd-release-rollback.sh via valueor-prod-rollback.
set -euo pipefail

if systemctl is-active --quiet valueor-api.service 2>/dev/null; then
  if [[ -L /opt/valueor-current ]] || [[ -d /opt/valueor-releases ]]; then
    echo "Refusing Compose rollback: Contabo production uses Nginx + systemd release directories."
    echo "Use: sudo -n /usr/local/sbin/valueor-prod-rollback"
    exit 2
  fi
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed. Contabo production does not use Compose."
  echo "Use deploy/vps/systemd-release-rollback.sh instead."
  exit 2
fi

APP_DIR=/opt/valueor
cd "$APP_DIR"

for name in valueor-app valueor-frontend; do
  if ! docker image inspect "${name}:previous" >/dev/null 2>&1; then
    echo "No previous image for ${name}."
    exit 2
  fi
  docker tag "${name}:previous" "${name}:current"
done

docker compose -f deploy/vps/compose.yml up -d --no-build --remove-orphans

for _ in $(seq 1 30); do
  if docker compose -f deploy/vps/compose.yml exec -T api node -e "fetch('http://127.0.0.1:3000/api/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Rollback liveness check passed."
    exit 0
  fi
  sleep 2
done

echo "Rollback liveness check failed."
exit 1

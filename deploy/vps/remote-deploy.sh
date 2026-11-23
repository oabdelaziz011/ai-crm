#!/usr/bin/env bash
# NON-PRODUCTION / Compose-lab only.
# Contabo production MUST use deploy/vps/systemd-release-deploy.sh via valueor-prod-deploy.
# This script builds and runs Docker Compose + Caddy. It is retained for documented lab use only.
set -euo pipefail

APP_DIR=/opt/valueor
REPO=https://github.com/oabdelaziz011/ai-crm.git
SHA="${1:?git sha required}"
COMPOSE_FILE=deploy/vps/compose.yml

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi

# Hard refuse on the live Contabo nginx/systemd topology.
if systemctl is-active --quiet valueor-api.service 2>/dev/null; then
  if [[ -L /opt/valueor-current ]] || [[ -d /opt/valueor-releases ]]; then
    echo "Refusing Compose deploy: Contabo production uses Nginx + systemd release directories."
    echo "Use: sudo -n /usr/local/sbin/valueor-prod-deploy <sha>"
    exit 2
  fi
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed. Contabo production does not use Compose."
  echo "Use deploy/vps/systemd-release-deploy.sh instead."
  exit 2
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch --prune origin

# Env backups created during repairs must not block deploy. Preserve them outside the
# git worktree (never delete; never overwrite an existing backup name; never touch
# production.env / .env themselves). Prefer /var/backups when writable; else home.
preserve_env_backup_sidecars() {
  local dest=""
  if mkdir -p /var/backups/valueor/env 2>/dev/null && [[ -w /var/backups/valueor/env ]]; then
    dest=/var/backups/valueor/env
  else
    dest="${HOME:-/home/valueor}/backups/env"
    mkdir -p "$dest"
  fi
  local moved=0
  local f base target
  shopt -s nullglob
  for f in deploy/vps/production.env.bak* .env.bak*; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    target="${dest}/${base}"
    if [[ -e "$target" ]]; then
      target="${dest}/${base}.$(date -u +%Y%m%dT%H%M%SZ)"
    fi
    mv -n "$f" "$target"
    echo "Preserved env backup sidecar at ${target}"
    moved=1
  done
  shopt -u nullglob
  if [[ "$moved" -eq 1 ]]; then
    echo "Env backup sidecars were moved under ${dest}; production.env/.env were not modified."
  fi
}
preserve_env_backup_sidecars

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Server worktree is dirty. Refusing to deploy."
  # Names only — never dump file contents (may include secrets).
  git status --short
  exit 2
fi
git checkout --detach "$SHA"

if [[ ! -f deploy/vps/production.env ]]; then
  echo "Missing deploy/vps/production.env. Copy production.env.example and fill it on the server."
  exit 2
fi

# production.env is dotenv format (Compose/systemd), not a Bash script. Never `source` it —
# unquoted values and orphan URI lines break Bash (e.g. unexpected token '(').
# validate-vps-config.mjs parses it with a dotenv reader; Compose --env-file does interpolation.
node scripts/validate-vps-config.mjs --env deploy/vps/production.env --topology compose

stamp_previous() {
  local name="$1"
  if docker image inspect "${name}:current" >/dev/null 2>&1; then
    docker tag "${name}:current" "${name}:previous"
  fi
}

stamp_previous valueor-app
stamp_previous valueor-frontend

docker compose --env-file deploy/vps/production.env -f "$COMPOSE_FILE" build
docker compose --env-file deploy/vps/production.env -f "$COMPOSE_FILE" up -d --remove-orphans

for _ in $(seq 1 30); do
  if docker compose --env-file deploy/vps/production.env -f "$COMPOSE_FILE" exec -T api node -e "fetch('http://127.0.0.1:3000/api/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "API liveness check passed for ${SHA}."
    exit 0
  fi
  sleep 2
done

echo "API liveness check failed. The previous image tags are still available to deploy/vps/remote-rollback.sh."
exit 1

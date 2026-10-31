#!/usr/bin/env bash
# Deploy one git SHA on the VPS. Refuses a dirty server tree and a non-SHA argument.
set -euo pipefail

APP_DIR=/opt/valueor
REPO=https://github.com/oabdelaziz011/ai-crm.git
SHA="${1:?git sha required}"
COMPOSE_FILE=deploy/vps/compose.yml

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch --prune origin
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Server worktree is dirty. Refusing to deploy."
  exit 2
fi
git checkout --detach "$SHA"

if [[ ! -f deploy/vps/production.env ]]; then
  echo "Missing deploy/vps/production.env. Copy production.env.example and fill it on the server."
  exit 2
fi

set -a
# shellcheck disable=SC1091
source deploy/vps/production.env
set +a

node scripts/validate-vps-config.mjs --env deploy/vps/production.env

stamp_previous() {
  local name="$1"
  if docker image inspect "${name}:current" >/dev/null 2>&1; then
    docker tag "${name}:current" "${name}:previous"
  fi
}

stamp_previous valueor-app
stamp_previous valueor-frontend

docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T api node -e "fetch('http://127.0.0.1:3000/api/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "API liveness check passed for ${SHA}."
    exit 0
  fi
  sleep 2
done

echo "API liveness check failed. The previous image tags are still available to deploy/vps/remote-rollback.sh."
exit 1

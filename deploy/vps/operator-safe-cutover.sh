#!/usr/bin/env bash
# Safe VPS stages only: fetch approved SHA, preflight, backup, install.
# Does NOT reload Nginx, stop API processes, change DNS/Meta/SQL, or touch .env values.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
EXPECTED_SHA="${EXPECTED_SHA:-6ae06319f5b2c55926a2a27fbcce6d8f6de58ff9}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-release/hetzner-nginx-cutover}"

cd "${APP_DIR}"

echo "== safety =="
if [[ ! -f .env ]]; then
  echo "Missing ${APP_DIR}/.env — aborting." >&2
  exit 2
fi
# Refuse destructive sync patterns.
if git status --porcelain | grep -q .; then
  echo "Working tree is dirty. Resolve or stash on the VPS before continuing." >&2
  echo "Refusing git reset --hard / force checkout." >&2
  git status -sb
  exit 2
fi

echo "== fetch approved release =="
git fetch --no-tags "${REMOTE}" "${BRANCH}"
ACTUAL="$(git rev-parse "${REMOTE}/${BRANCH}")"
if [[ "${ACTUAL}" != "${EXPECTED_SHA}" && "${ACTUAL}" != "${EXPECTED_SHA:0:40}" ]]; then
  # Also accept exact object if tip moved; require exact SHA checkout below.
  echo "Remote tip=${ACTUAL}; will check out exact EXPECTED_SHA=${EXPECTED_SHA}"
fi
if ! git cat-file -e "${EXPECTED_SHA}^{commit}"; then
  echo "Expected SHA not present after fetch." >&2
  exit 2
fi
git checkout --detach "${EXPECTED_SHA}"
git rev-parse HEAD
test "$(git rev-parse HEAD)" = "${EXPECTED_SHA}"

echo "== deploy-production safe stages =="
sudo bash deploy/vps/deploy-production.sh preflight --expected-sha "${EXPECTED_SHA}"
sudo bash deploy/vps/deploy-production.sh backup
sudo bash deploy/vps/deploy-production.sh install

cat <<EOF

Safe stages complete (Nginx NOT reloaded; API NOT handed over).

Next approvals required:

1) Nginx reload (production-impacting):
   sudo bash deploy/vps/deploy-production.sh reload-nginx --confirm-reload-nginx

2) API handover (stops current :3001 holder, starts systemd):
   sudo bash deploy/vps/deploy-production.sh handover --confirm-stop-port-holder
   sudo bash deploy/vps/deploy-production.sh health

3) Frontend publish (after verified artifact for ${EXPECTED_SHA}):
   sudo bash deploy/vps/deploy-production.sh publish-frontend --frontend-src /path/to/dist/public

Rollback:
   sudo bash deploy/vps/deploy-production.sh rollback-service
EOF

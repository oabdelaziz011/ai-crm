#!/usr/bin/env bash
# Permanent Contabo production deploy (Nginx + systemd + release directories).
# Must run as root via /usr/local/sbin/valueor-prod-deploy.
# Never invokes Docker, Compose, or Caddy. Never prints secret values.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
SHA="${1:?git sha required}"
ARTIFACTS_DIR="${VALUEOR_ARTIFACTS_DIR:-}"
ROOT_PREFIX="${VALUEOR_DEPLOY_ROOT:-}"
DRY_RUN="${VALUEOR_DRY_RUN:-0}"
SKIP_HEALTH="${VALUEOR_SKIP_HEALTH:-0}"
SKIP_RESTART="${VALUEOR_SKIP_RESTART:-0}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi

if [[ "$(id -u)" -ne 0 && -z "$ROOT_PREFIX" ]]; then
  echo "systemd-release-deploy.sh must run as root (or with VALUEOR_DEPLOY_ROOT for isolated tests)."
  exit 2
fi

ENV_FILE="${APP_DIR}/.env"
if [[ -n "$ROOT_PREFIX" ]]; then
  ENV_FILE="${ROOT_PREFIX%/}/opt/valueor/.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production env file (path only): ${ENV_FILE}"
  exit 2
fi

echo "[deploy] topology=nginx-systemd sha=${SHA}"

if [[ -z "$ROOT_PREFIX" ]]; then
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    echo "Missing git checkout at ${APP_DIR}"
    exit 2
  fi
  # Keep deploy scripts on the approved SHA. Never print env or secret files.
  git -C "$APP_DIR" fetch --prune origin
  if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
    echo "Server worktree is dirty. Refusing to deploy."
    git -C "$APP_DIR" status --short
    exit 2
  fi
  git -C "$APP_DIR" checkout --detach "$SHA"
fi

# Validate env for the real production topology (no ACME_EMAIL required).
/usr/bin/node "${APP_DIR}/scripts/validate-vps-config.mjs" --env "$ENV_FILE" --topology nginx-systemd

if [[ -z "$ARTIFACTS_DIR" ]]; then
  echo "VALUEOR_ARTIFACTS_DIR is required (staged api/ + frontend/ artifacts)."
  exit 2
fi

API_SRC="${ARTIFACTS_DIR}/api"
FE_SRC="${ARTIFACTS_DIR}/frontend"

if [[ ! -f "${API_SRC}/artifacts/api-server/dist/main.mjs" ]]; then
  echo "Missing API artifact at ${API_SRC}/artifacts/api-server/dist/main.mjs"
  echo "Build on GitHub-hosted runners and place artifacts before calling this script."
  exit 2
fi
if [[ ! -f "${FE_SRC}/index.html" || ! -f "${FE_SRC}/version.json" ]]; then
  echo "Missing frontend artifact (index.html/version.json) under ${FE_SRC}"
  exit 2
fi

SWITCH_ARGS=(deploy --sha "$SHA" --api-src "$API_SRC" --frontend-src "$FE_SRC")
if [[ -n "$ROOT_PREFIX" ]]; then
  SWITCH_ARGS+=(--root "$ROOT_PREFIX")
fi
if [[ "$DRY_RUN" == "1" ]]; then
  SWITCH_ARGS+=(--dry-run)
fi
if [[ "$SKIP_HEALTH" == "1" ]]; then
  SWITCH_ARGS+=(--skip-health)
fi
if [[ "$SKIP_RESTART" == "1" ]]; then
  SWITCH_ARGS+=(--skip-restart)
fi

SWITCH_JS="${APP_DIR}/scripts/systemd-release-switch.mjs"
if [[ ! -f "$SWITCH_JS" ]]; then
  echo "Missing ${SWITCH_JS}"
  exit 2
fi

echo "[deploy] switching releases (secrets not logged)"
/usr/bin/node "$SWITCH_JS" "${SWITCH_ARGS[@]}"
echo "[deploy] ok"

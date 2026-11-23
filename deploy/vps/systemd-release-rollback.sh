#!/usr/bin/env bash
# Permanent Contabo production rollback (Nginx + systemd + release directories).
# Must run as root via /usr/local/sbin/valueor-prod-rollback.
# Restores previous API + frontend release symlinks and restarts valueor-api.
# Never invokes Docker, Compose, or Caddy. Never prints secret values.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/valueor}"
ROOT_PREFIX="${VALUEOR_DEPLOY_ROOT:-}"
DRY_RUN="${VALUEOR_DRY_RUN:-0}"
SKIP_HEALTH="${VALUEOR_SKIP_HEALTH:-0}"
SKIP_RESTART="${VALUEOR_SKIP_RESTART:-0}"

if [[ "$(id -u)" -ne 0 && -z "$ROOT_PREFIX" ]]; then
  echo "systemd-release-rollback.sh must run as root (or with VALUEOR_DEPLOY_ROOT for isolated tests)."
  exit 2
fi

echo "[rollback] topology=nginx-systemd"

SWITCH_ARGS=(rollback)
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

/usr/bin/node "$SWITCH_JS" "${SWITCH_ARGS[@]}"
echo "[rollback] ok"

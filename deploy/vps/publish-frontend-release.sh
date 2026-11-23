#!/usr/bin/env bash
# Publish a frontend SPA into /opt/valueor-frontend-releases/<sha> and atomically
# flip /var/www/valueor (keeps previous symlink). Does not touch TLS, Nginx site
# files, API releases, or /opt/valueor/.env.
set -euo pipefail

SHA="${1:?git sha required}"
SRC="${2:?frontend dist directory required}"
LABEL="${3:-}"
ROOT_PREFIX="${VALUEOR_DEPLOY_ROOT:-}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a ref that is not a full git SHA."
  exit 2
fi
if [[ ! -f "${SRC}/index.html" || ! -f "${SRC}/version.json" ]]; then
  echo "Frontend src must contain index.html and version.json"
  exit 2
fi

map_path() {
  local abs="$1"
  if [[ -n "$ROOT_PREFIX" ]]; then
    echo "${ROOT_PREFIX%/}/${abs#/}"
  else
    echo "$abs"
  fi
}

FE_ROOT="$(map_path /opt/valueor-frontend-releases)"
LINK="$(map_path /var/www/valueor)"
PREV="$(map_path /var/www/valueor.previous)"
SHORT="${SHA:0:16}"
DEST="${FE_ROOT}/${SHORT}"
if [[ -n "$LABEL" ]]; then
  DEST="${FE_ROOT}/${SHORT}-${LABEL}"
fi

if [[ -e "$DEST" ]]; then
  echo "Frontend release already exists: ${DEST}"
  exit 2
fi

mkdir -p "$FE_ROOT" "$(dirname "$LINK")"
mkdir -p "$DEST"
cp -a "${SRC}/." "$DEST/"
printf '%s\n' "$SHA" >"${DEST}/RELEASE_SHA"

if [[ -L "$LINK" || -e "$LINK" ]]; then
  CURRENT_TARGET="$(readlink -f "$LINK" 2>/dev/null || true)"
  if [[ -n "$CURRENT_TARGET" ]]; then
    ln -sfn "$CURRENT_TARGET" "${PREV}.new"
    mv -Tf "${PREV}.new" "$PREV"
  fi
fi
ln -sfn "$DEST" "${LINK}.new"
mv -Tf "${LINK}.new" "$LINK"
echo "frontend_release=${DEST}"
echo "frontend_link=${LINK}"

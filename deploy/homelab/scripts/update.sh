#!/bin/sh
# Update Trivia Pig to the newest code and restart it, only if something changed.
# Run on the homelab host:   ./scripts/update.sh
# Or nightly from cron (a game in progress survives: it is saved and resumes after the restart,
# but pick a quiet hour anyway):
#   30 5 * * *  /path/to/jeppidy/deploy/homelab/scripts/update.sh >> /var/log/triviapig-update.log 2>&1
set -eu
cd "$(dirname "$0")/.."

log() { echo "[update $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Skip while people are playing, unless forced:  FORCE=1 ./scripts/update.sh
if [ "${FORCE:-0}" != "1" ]; then
  status="$(docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>console.log(j.sockets||0)).catch(()=>console.log(0))" 2>/dev/null || echo 0)"
  if [ "${status:-0}" -gt 0 ] 2>/dev/null; then
    log "$status device(s) connected to a game; skipping (use FORCE=1 to update anyway)"
    exit 0
  fi
fi

APP_IMAGE="$(grep -E '^APP_IMAGE=' .env 2>/dev/null | cut -d= -f2- || true)"
if [ -n "$APP_IMAGE" ]; then
  log "pulling $APP_IMAGE"
  docker compose pull app
else
  before="$(git rev-parse HEAD)"
  git pull --ff-only
  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ] && [ "${FORCE:-0}" != "1" ]; then
    log "already up to date ($after)"
    exit 0
  fi
  log "building $after"
  APP_VERSION="$(git rev-parse --short HEAD)" docker compose build app
fi

# --wait returns only once the new container reports healthy.
if docker compose up -d --wait app; then
  log "app is healthy"
  docker image prune -f >/dev/null
else
  log "ERROR: app did not become healthy; recent logs:"
  docker compose logs --tail 60 app
  exit 1
fi

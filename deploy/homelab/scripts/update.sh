#!/bin/sh
# Deploy the newest Trivia Pig, but only when nobody is in the middle of a game.
#
#   ./scripts/update.sh              deploy if there is something new and the room is quiet
#   FORCE=1 ./scripts/update.sh      deploy now, even with a game running (it is saved and resumes)
#   QUIET=1 ./scripts/update.sh      say nothing when there is nothing to do (used by the timer)
#
# scripts/install-autodeploy.sh runs this every two minutes from a systemd timer, which makes
# the whole pipeline: push to main -> CI tests -> image published -> this host picks it up at
# the next quiet moment. If the new version does not come up healthy, the previous one is
# put back and that version is not tried again.
#
# "Quiet" means: no device is connected to a game that is still being played, or those games
# have not changed for DEPLOY_IDLE_MIN minutes (default 20; a display tab left open overnight
# should not block updates forever).
set -eu
cd "$(dirname "$0")/.."

log() { echo "[update $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
note() { [ "${QUIET:-0}" = "1" ] || log "$@"; }

# One run at a time (the timer and a manual run must not overlap).
if command -v flock >/dev/null 2>&1; then
  exec 9>.update.lock
  flock -n 9 || { note "another update is running"; exit 0; }
fi

envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
APP_IMAGE="$(envval APP_IMAGE)"
IDLE_MIN="${DEPLOY_IDLE_MIN:-$(envval DEPLOY_IDLE_MIN)}"
IDLE_MIN="${IDLE_MIN:-20}"

# ---- 1. Fetch: new compose file and scripts from git, and (image mode) the new image.
before="$(git rev-parse HEAD)"
git pull -q --ff-only || log "WARNING: git pull failed; continuing with the code already here"
after="$(git rev-parse HEAD)"
if [ "$before" != "$after" ]; then
  : > .deploy-pending
  # This script may have changed too: start over with the new copy.
  if [ -z "${UPDATE_REEXEC:-}" ]; then
    UPDATE_REEXEC=1 exec "$0" "$@"
  fi
fi

running="$(docker compose ps -q app 2>/dev/null | head -1)"
current=""
[ -n "$running" ] && current="$(docker inspect -f '{{.Image}}' "$running" 2>/dev/null || true)"

if [ -n "$APP_IMAGE" ]; then
  docker compose pull -q app || log "WARNING: could not pull $APP_IMAGE"
  target="$(docker image inspect -f '{{.Id}}' "$APP_IMAGE" 2>/dev/null || true)"
  if [ -n "$target" ] && [ "$target" != "$current" ]; then
    # Optional: only deploy an image that the repository's publish workflow signed.
    SIGNER="$(envval VERIFY_IMAGE_SIGNER)"
    # (An image that was already refused is not checked, or reported, again every two minutes.)
    if [ -n "$SIGNER" ] && [ "$(cat .deploy-failed 2>/dev/null || true)" != "$target" ]; then
      digest="$(docker image inspect -f '{{index .RepoDigests 0}}' "$APP_IMAGE" 2>/dev/null || true)"
      auth=""
      [ -f "${HOME:-/root}/.docker/config.json" ] && auth="-v ${HOME:-/root}/.docker/config.json:/tmp/docker/config.json:ro -e DOCKER_CONFIG=/tmp/docker"
      # shellcheck disable=SC2086
      if [ -z "$digest" ] || ! docker run --rm $auth "${COSIGN_IMAGE:-ghcr.io/sigstore/cosign/cosign:v3.1.4}" verify \
          --certificate-oidc-issuer https://token.actions.githubusercontent.com \
          --certificate-identity-regexp "$SIGNER" "$digest" >/dev/null 2>&1; then
        log "ERROR: $APP_IMAGE is not signed by $SIGNER; not deploying it"
        echo "$target" > .deploy-failed
        rm -f .deploy-pending
        ./scripts/notify.sh "Trivia Pig update refused" "The new image's signature could not be verified, so it was not deployed. See: journalctl -u triviapig-deploy -n 100" urgent >/dev/null 2>&1 || true
        exit 1
      fi
      note "signature verified for $digest"
    fi
    : > .deploy-pending
  fi
else
  target="$after"
fi

if [ ! -e .deploy-pending ] && [ "${FORCE:-0}" != "1" ]; then
  note "already up to date"
  exit 0
fi
if [ "${FORCE:-0}" != "1" ] && [ -e .deploy-failed ] && [ "$(cat .deploy-failed)" = "$target" ]; then
  note "this version failed to start earlier and was rolled back; waiting for a newer one (FORCE=1 to retry)"
  exit 0
fi

# ---- 2. Wait for a quiet moment.
if [ "${FORCE:-0}" != "1" ] && [ -n "$running" ]; then
  status="$(docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>console.log((j.playing??j.sockets??0)+' '+(j.idleSec??0))).catch(()=>console.log('0 0'))" 2>/dev/null || echo "0 0")"
  playing="${status%% *}"
  idle="${status##* }"
  if [ "${playing:-0}" -gt 0 ] 2>/dev/null && [ "${idle:-0}" -lt $((IDLE_MIN * 60)) ] 2>/dev/null; then
    log "new version is ready; waiting for $playing device(s) to finish their game (FORCE=1 to deploy now)"
    exit 0
  fi
fi

# ---- 3. Deploy, and put the old version back if the new one is not healthy.
if [ -n "$APP_IMAGE" ]; then
  log "deploying $APP_IMAGE"
else
  log "building $after"
  # Exported so the "up" below (which also builds) labels the image with the same version.
  APP_VERSION="$(git rev-parse --short HEAD)"
  export APP_VERSION
  docker compose build app
fi
[ -n "$current" ] && docker tag "$current" triviapig:previous 2>/dev/null || true

# --wait returns only once the new container reports healthy.
if docker compose up -d --wait app; then
  rm -f .deploy-pending .deploy-failed
  version="$(docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>console.log(j.version)).catch(()=>console.log('?'))" 2>/dev/null || echo '?')"
  log "app is healthy (version $version)"
  ./scripts/notify.sh "Trivia Pig updated" "Version $version is live." normal >/dev/null 2>&1 || true
  docker image prune -f >/dev/null
  exit 0
fi

log "ERROR: the new version did not become healthy; recent logs:"
docker compose logs --tail 60 app || true
echo "$target" > .deploy-failed
rm -f .deploy-pending
if [ -n "$current" ]; then
  log "rolling back to the previous version"
  if APP_IMAGE=triviapig:previous APP_PULL_POLICY=never docker compose up -d --wait app; then
    log "rolled back; the previous version is healthy"
    ./scripts/notify.sh "Trivia Pig update failed" "The new version did not start, so the previous one was put back. See: journalctl -u triviapig-deploy -n 100" urgent >/dev/null 2>&1 || true
  else
    log "ERROR: rollback did not become healthy either"
    ./scripts/notify.sh "Trivia Pig is down after a failed update" "Neither the new nor the previous version started. See: journalctl -u triviapig-deploy -n 100" urgent >/dev/null 2>&1 || true
  fi
fi
exit 1

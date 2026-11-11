#!/bin/sh
# Container entrypoint.
#   1. (as root) make the data volume writable by the unprivileged "app" user, then drop to it
#   2. wait for Postgres and apply migrations (retries, so boot order does not matter)
#   3. optionally seed the demo account
#   4. start the server (tini is PID 1 and forwards signals)
set -eu

UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD_DIR"
  # Bind mounts are created root-owned by Docker; fix that once so uploads work.
  if [ "$(stat -c %U "$UPLOAD_DIR")" != "app" ]; then
    chown -R app:app /data || echo "WARNING: could not chown /data; image uploads may fail"
  fi
  exec setpriv --reuid=app --regid=app --init-groups sh "$0" "$@"
fi

if [ ! -w "$UPLOAD_DIR" ] && [ "${STORAGE_DRIVER:-local}" = "local" ]; then
  echo "WARNING: $UPLOAD_DIR is not writable by $(id -un); image uploads will fail"
fi

PRISMA="node node_modules/prisma/build/index.js"
TRIES="${DB_WAIT_ATTEMPTS:-40}"
i=1
echo "Applying database migrations..."
until $PRISMA migrate deploy; do
  if [ "$i" -ge "$TRIES" ]; then
    echo "Migrations still failing after $TRIES attempts; exiting so the container restarts."
    exit 1
  fi
  echo "Database not ready or migration failed (attempt $i/$TRIES); retrying in 3s..."
  i=$((i + 1))
  sleep 3
done

if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "Seeding demo account and board (SEED_DEMO=true)..."
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts || echo "Seed skipped/failed (non-fatal)"
fi

exec node dist/server.js

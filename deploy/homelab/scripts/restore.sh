#!/bin/sh
# Restore the database (and optionally uploaded images) from a backup.
# Run on the homelab host, from deploy/homelab:
#
#   ./scripts/restore.sh                                   # newest dump (data/backups/latest.sql.gz)
#   ./scripts/restore.sh data/backups/daily/trivia-20261111-040000.sql.gz
#   ./scripts/restore.sh <dump.sql.gz> <uploads-....tar.gz>   # also restore images
#
# The current database is dumped to data/backups/pre-restore-<time>.sql.gz first,
# so a restore can itself be undone.
set -eu
cd "$(dirname "$0")/.."

DUMP="${1:-data/backups/latest.sql.gz}"
UPLOADS="${2:-}"
[ -f "$DUMP" ] || { echo "No such backup: $DUMP"; exit 1; }
gzip -t "$DUMP" || { echo "Backup is corrupt: $DUMP"; exit 1; }
[ -z "$UPLOADS" ] || [ -f "$UPLOADS" ] || { echo "No such uploads archive: $UPLOADS"; exit 1; }

echo "This REPLACES the live Trivia Pig database with: $DUMP"
[ -n "$UPLOADS" ] && echo "and replaces uploaded images with:               $UPLOADS"
printf "Type 'restore' to continue: "
read -r answer
[ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }

echo "Stopping the app..."
docker compose stop app

SAFETY="data/backups/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "Saving the current database to $SAFETY ..."
docker compose exec -T db pg_dump -U trivia --no-owner --no-privileges trivia | gzip > "$SAFETY"

echo "Restoring..."
docker compose exec -T db psql -U trivia -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS trivia WITH (FORCE);" -c "CREATE DATABASE trivia OWNER trivia;"
gunzip -c "$DUMP" | docker compose exec -T db psql -U trivia -d trivia -v ON_ERROR_STOP=1 -q

if [ -n "$UPLOADS" ]; then
  echo "Restoring uploaded images..."
  mkdir -p data/uploads
  tar -xzf "$UPLOADS" -C data/uploads
fi

echo "Starting the app (migrations run automatically)..."
docker compose up -d app
echo "Done. Check: docker compose logs -f app"

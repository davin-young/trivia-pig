#!/bin/sh
# Backup loop for the "backup" service (runs inside postgres:17-alpine).
#
# Once at start (if the newest backup is older than 20 hours) and then every day at
# BACKUP_HOUR, it writes into /backups:
#   daily/trivia-YYYYmmdd-HHMMSS.sql.gz      pg_dump of the database (gzip-verified)
#   daily/uploads-YYYYmmdd-HHMMSS.tar.gz     uploaded images, if any
#   monthly/...                              copy of the first backup of each month
#   latest.sql.gz                            copy of the newest database dump
#   .last-success                            unix time of the newest good backup (healthcheck)
# Keeps BACKUP_KEEP_DAILY daily sets and BACKUP_KEEP_MONTHLY monthly sets.
set -u

BACKUP_HOUR="${BACKUP_HOUR:-4}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"
DIR=/backups
mkdir -p "$DIR/daily" "$DIR/monthly"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Delete all but the newest $2 files matching prefix $1 in directory $3.
rotate() {
  ls -1t "$3"/"$1"-* 2>/dev/null | tail -n +"$(($2 + 1))" | while read -r f; do rm -f "$f"; done
}

run_backup() {
  stamp="$(date +%Y%m%d-%H%M%S)"
  out="$DIR/daily/trivia-$stamp.sql.gz"
  tmp="$out.partial"
  log "dumping database..."
  if ! pg_dump --no-owner --no-privileges | gzip -9 > "$tmp"; then
    log "ERROR: pg_dump failed"; rm -f "$tmp"; return 1
  fi
  # Verify: the archive must be intact and end with pg_dump's completion marker.
  if ! gzip -t "$tmp" || ! gunzip -c "$tmp" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
    log "ERROR: dump failed verification"; rm -f "$tmp"; return 1
  fi
  mv "$tmp" "$out"
  cp -f "$out" "$DIR/latest.sql.gz"
  log "database dump ok: $(basename "$out") ($(du -h "$out" | cut -f1))"

  if [ -d /uploads ] && [ -n "$(ls -A /uploads 2>/dev/null)" ]; then
    up="$DIR/daily/uploads-$stamp.tar.gz"
    if tar -czf "$up.partial" -C /uploads . && mv "$up.partial" "$up"; then
      log "uploads archive ok: $(basename "$up") ($(du -h "$up" | cut -f1))"
    else
      log "WARNING: uploads archive failed"; rm -f "$up.partial"
    fi
  fi

  month="$(date +%Y%m)"
  if ! ls "$DIR/monthly/trivia-$month"* >/dev/null 2>&1; then
    cp "$out" "$DIR/monthly/"
    [ -f "$DIR/daily/uploads-$stamp.tar.gz" ] && cp "$DIR/daily/uploads-$stamp.tar.gz" "$DIR/monthly/"
    log "kept monthly copy for $month"
  fi

  rotate trivia "$KEEP_DAILY" "$DIR/daily"
  rotate uploads "$KEEP_DAILY" "$DIR/daily"
  rotate trivia "$KEEP_MONTHLY" "$DIR/monthly"
  rotate uploads "$KEEP_MONTHLY" "$DIR/monthly"
  date +%s > "$DIR/.last-success"
  return 0
}

# Seconds until the next BACKUP_HOUR:00 local time.
seconds_until_next() {
  now_h=$(date +%H); now_m=$(date +%M); now_s=$(date +%S)
  now=$(( ${now_h#0} * 3600 + ${now_m#0} * 60 + ${now_s#0} ))
  target=$(( BACKUP_HOUR * 3600 ))
  if [ "$now" -lt "$target" ]; then echo $(( target - now )); else echo $(( 86400 - now + target )); fi
}

trap 'log "stopping"; exit 0' TERM INT

last=0
[ -f "$DIR/.last-success" ] && last="$(cat "$DIR/.last-success")"
if [ $(( $(date +%s) - last )) -gt 72000 ]; then
  run_backup || log "startup backup failed; will retry in 10 minutes"
fi

while true; do
  last=0
  [ -f "$DIR/.last-success" ] && last="$(cat "$DIR/.last-success")"
  if [ $(( $(date +%s) - last )) -gt 93600 ]; then
    wait_s=600   # overdue: keep retrying every 10 minutes
  else
    wait_s="$(seconds_until_next)"
  fi
  log "next backup in $(( wait_s / 60 )) min"
  sleep "$wait_s" &
  wait $!
  run_backup || log "backup failed; will retry"
done

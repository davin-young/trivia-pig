#!/bin/sh
# Watch Trivia Pig and send a notification (scripts/notify.sh, ALERT_URL in .env) when
# something needs you. Runs every minute from the timer that install-autodeploy.sh sets up.
#
# Each problem is reported once when it starts and once when it clears, not every minute.
#
#   app down          the app does not answer on /readyz twice in a row      (urgent)
#   site unreachable  APP_URL/healthz fails from this host twice in a row     (urgent)
#   app crashed       Docker had to restart the app container                 (urgent)
#   not saving        games cannot be written to the database                 (urgent)
#   busy              ALERT_USERS or more devices connected (default 100)
#   memory            the app is above ALERT_MEM_PCT of its memory limit (default 85)
#   disk              the data disk is above ALERT_DISK_PCT full (default 90)
#   backup            the nightly backup is overdue
#   clock             the system clock jumped (this breaks buzzer timing on old versions)
#
# If the whole machine is off, nothing here can run: set HEARTBEAT_URL (see the end of this file).
set -u
cd "$(dirname "$0")/.."
state=data/monitor
mkdir -p "$state"

envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
USERS="$(envval ALERT_USERS)"; USERS="${USERS:-100}"
MEM_PCT="$(envval ALERT_MEM_PCT)"; MEM_PCT="${MEM_PCT:-85}"
DISK_PCT="$(envval ALERT_DISK_PCT)"; DISK_PCT="${DISK_PCT:-90}"
APP_URL="$(envval APP_URL)"

# check <key> <bad: 0|1> <needed-in-a-row> <level> <title> <message> <recovered-message>
check() {
  key="$1"; bad="$2"; need="$3"; level="$4"; title="$5"; msg="$6"; ok="$7"
  f="$state/$key"
  n="$(cat "$f" 2>/dev/null || echo 0)"
  if [ "$bad" = "1" ]; then
    n=$((n + 1))
    echo "$n" > "$f"
    [ "$n" -eq "$need" ] && ./scripts/notify.sh "$title" "$msg" "$level"
  else
    [ "$n" -ge "$need" ] && ./scripts/notify.sh "Recovered: $title" "$ok" normal
    echo 0 > "$f"
  fi
  return 0
}
num() { case "${1:-}" in ''|*[!0-9]*) echo "${2:-0}" ;; *) echo "$1" ;; esac; }

# A deploy restarts the app on purpose; stay quiet while one is running.
if command -v flock >/dev/null 2>&1 && [ -e .update.lock ] && ! flock -n .update.lock true; then
  exit 0
fi

# ---- the app itself
ready="$(docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>console.log([j.ok?1:0,j.sockets??0,j.unsaved??0,j.games??0,j.version].join(' '))).catch(()=>console.log('0 0 0 0 ?'))" 2>/dev/null || echo "0 0 0 0 ?")"
set -- $ready
ok="$(num "${1:-0}")"; sockets="$(num "${2:-0}")"; unsaved="$(num "${3:-0}")"; games="$(num "${4:-0}")"

check app-down "$([ "$ok" = 1 ] && echo 0 || echo 1)" 2 urgent "Trivia Pig is down" \
  "The app is not answering. Docker restarts it on its own; check: docker compose logs --tail 80 app" "The app is answering again."

if [ -n "$APP_URL" ]; then
  curl -fsS -m 10 -o /dev/null "$APP_URL/healthz" 2>/dev/null && site=0 || site=1
  # Only meaningful while the app itself is fine; otherwise "app down" already says it.
  [ "$ok" = 1 ] || site=0
  check site-down "$site" 2 urgent "Trivia Pig is unreachable from the internet" \
    "$APP_URL does not load, but the app is running. Look at the tunnel, Traefik or DNS." "$APP_URL loads again."
fi

check not-saving "$([ "$unsaved" -gt 0 ] && echo 1 || echo 0)" 3 urgent "Games are not being saved" \
  "$unsaved game(s) cannot be written to the database. Check: docker compose ps db" "Games are saving again."

check busy "$([ "$sockets" -ge "$USERS" ] && echo 1 || echo 0)" 1 normal "Trivia Pig is busy" \
  "$sockets devices connected across $games game(s) (alert level: $USERS)." "Back under $USERS connected devices."

# ---- crashes: Docker's restart counter for the app container went up
cid="$(docker compose ps -q app 2>/dev/null | head -1)"
if [ -n "$cid" ]; then
  now="$cid:$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
  was="$(cat "$state/restarts" 2>/dev/null || echo "$now")"
  if [ "${was%%:*}" = "$cid" ] && [ "$(num "${now##*:}")" -gt "$(num "${was##*:}")" ]; then
    ./scripts/notify.sh "Trivia Pig crashed and restarted" "Docker restarted the app (restart number ${now##*:}). Games resume on their own. Check: docker compose logs --tail 120 app" urgent
  fi
  echo "$now" > "$state/restarts"

  mem="$(docker stats --no-stream --format '{{.MemPerc}}' "$cid" 2>/dev/null | tr -d '%' | cut -d. -f1)"
  mem="$(num "$mem")"
  check memory "$([ "$mem" -ge "$MEM_PCT" ] && echo 1 || echo 0)" 3 normal "Trivia Pig is short on memory" \
    "The app is using ${mem}% of its memory limit. It restarts if it reaches 100%. Raise APP_MEM_LIMIT in .env." "Memory use is back to normal."
fi

# ---- the host
disk="$(df -P data 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
disk="$(num "$disk")"
check disk "$([ "$disk" -ge "$DISK_PCT" ] && echo 1 || echo 0)" 1 normal "Disk is almost full" \
  "The disk holding Trivia Pig's data is ${disk}% full." "Disk space is back under ${DISK_PCT}%."

bid="$(docker compose ps -q backup 2>/dev/null | head -1)"
if [ -n "$bid" ]; then
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$bid" 2>/dev/null || true)"
  check backup "$([ "$health" = unhealthy ] && echo 1 || echo 0)" 1 normal "Backups are overdue" \
    "No successful backup in the last 26 hours. Check: docker compose logs --tail 40 backup" "Backups are running again."
fi

# ---- clock steps: compare the wall clock with the uptime counter between runs
wall="$(date +%s)"
up="$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)"
if [ -e "$state/clock" ]; then
  read -r pwall pup < "$state/clock"
  drift=$(( (wall - $(num "$pwall")) - (up - $(num "$pup")) ))
  [ "$drift" -lt 0 ] && drift=$(( -drift ))
  # A reboot resets uptime; ignore that case.
  [ "$up" -lt "$(num "$pup")" ] && drift=0
  check clock "$([ "$drift" -ge 30 ] && echo 1 || echo 0)" 1 normal "The server clock jumped" \
    "The system clock moved by about ${drift} s. Check time sync on the host (VMware Tools time sync and NTP must not fight)." "The clock is steady again."
fi
echo "$wall $up" > "$state/clock"

# ---- dead man's switch: a host that is off cannot send anything, so tell an outside service
# "still alive" every minute and let it raise the alarm when the pings stop
# (for example a free check at healthchecks.io; put its ping URL in HEARTBEAT_URL).
HEARTBEAT_URL="$(envval HEARTBEAT_URL)"
[ -n "$HEARTBEAT_URL" ] && [ "$ok" = 1 ] && curl -fsS -m 10 -o /dev/null "$HEARTBEAT_URL" 2>/dev/null
exit 0

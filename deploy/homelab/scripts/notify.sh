#!/bin/sh
# Send a notification to the address in ALERT_URL (.env). Used by monitor.sh and update.sh.
#
#   ./scripts/notify.sh "Title" "Message" [urgent]
#   ./scripts/notify.sh test                     send a test message
#
# ALERT_URL can be:
#   https://ntfy.sh/<a-long-private-topic>       push to your phone with the free ntfy app
#   https://discord.com/api/webhooks/...         a Discord channel webhook
#   https://hooks.slack.com/services/...         a Slack incoming webhook
#   any other URL                                receives the ntfy format (text body, Title header)
# Without ALERT_URL the message is only printed.
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "test" ]; then
  set -- "Trivia Pig test" "Notifications are working." normal
fi
title="${1:?title}"
body="${2:-}"
level="${3:-normal}"
url="${ALERT_URL:-$(grep -E '^ALERT_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)}"

echo "[notify $(date '+%Y-%m-%d %H:%M:%S')] $title: $body"
[ -n "$url" ] || exit 0

json() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' '; }
case "$url" in
  *discord.com/api/webhooks/*|*discordapp.com/api/webhooks/*)
    curl -fsS -m 15 -H "Content-Type: application/json" -d "{\"content\":\"**$(json "$title")**\\n$(json "$body")\"}" "$url" >/dev/null ;;
  *hooks.slack.com/*)
    curl -fsS -m 15 -H "Content-Type: application/json" -d "{\"text\":\"*$(json "$title")*\\n$(json "$body")\"}" "$url" >/dev/null ;;
  *)
    prio=default
    tags=pig
    [ "$level" = "urgent" ] && prio=urgent && tags=rotating_light
    curl -fsS -m 15 -H "Title: $title" -H "Priority: $prio" -H "Tags: $tags" -d "$body" "$url" >/dev/null ;;
esac || echo "[notify] WARNING: could not reach the notification address"

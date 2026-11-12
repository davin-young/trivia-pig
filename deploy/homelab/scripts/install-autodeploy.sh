#!/bin/sh
# Install (or refresh) the automatic deploy timer and the monitor on this host. Run once, as root:
#
#   ./scripts/install-autodeploy.sh            check for a new version every 2 minutes,
#                                              and run scripts/monitor.sh every minute
#   ./scripts/install-autodeploy.sh remove     stop and remove the timer
#
# Every run of the timer calls scripts/update.sh, which deploys only when there is a new
# version and nobody is in the middle of a game. Watch it with:
#   journalctl -u triviapig-deploy -f          systemctl list-timers triviapig-deploy.timer
set -eu
dir="$(cd "$(dirname "$0")/.." && pwd)"
unit=/etc/systemd/system/triviapig-deploy
mon=/etc/systemd/system/triviapig-monitor

if [ "${1:-}" = "remove" ]; then
  systemctl disable --now triviapig-deploy.timer triviapig-monitor.timer 2>/dev/null || true
  rm -f "$unit.service" "$unit.timer" "$mon.service" "$mon.timer"
  systemctl daemon-reload
  echo "automatic deploys and monitoring removed"
  exit 0
fi

cat > "$unit.service" <<EOF
[Unit]
Description=Trivia Pig: deploy the newest version when no game is running
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$dir
Environment=QUIET=1
ExecStart=$dir/scripts/update.sh
# A build or a slow pull must not be cut off half way.
TimeoutStartSec=30min
EOF

cat > "$unit.timer" <<EOF
[Unit]
Description=Trivia Pig: check for a new version every 2 minutes

[Timer]
OnBootSec=3min
OnUnitInactiveSec=2min
RandomizedDelaySec=15s

[Install]
WantedBy=timers.target
EOF

cat > "$mon.service" <<EOF
[Unit]
Description=Trivia Pig: health checks and notifications
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=$dir
ExecStart=$dir/scripts/monitor.sh
TimeoutStartSec=2min
EOF

cat > "$mon.timer" <<EOF
[Unit]
Description=Trivia Pig: run the health checks every minute

[Timer]
OnBootSec=2min
OnUnitInactiveSec=1min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now triviapig-deploy.timer triviapig-monitor.timer
echo "automatic deploys and monitoring installed; logs: journalctl -u triviapig-deploy -u triviapig-monitor -f"

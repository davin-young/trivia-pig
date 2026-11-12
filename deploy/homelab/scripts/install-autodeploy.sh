#!/bin/sh
# Install (or refresh) the automatic deploy timer on this host. Run once, as root:
#
#   ./scripts/install-autodeploy.sh            check for a new version every 2 minutes
#   ./scripts/install-autodeploy.sh remove     stop and remove the timer
#
# Every run of the timer calls scripts/update.sh, which deploys only when there is a new
# version and nobody is in the middle of a game. Watch it with:
#   journalctl -u triviapig-deploy -f          systemctl list-timers triviapig-deploy.timer
set -eu
dir="$(cd "$(dirname "$0")/.." && pwd)"
unit=/etc/systemd/system/triviapig-deploy

if [ "${1:-}" = "remove" ]; then
  systemctl disable --now triviapig-deploy.timer 2>/dev/null || true
  rm -f "$unit.service" "$unit.timer"
  systemctl daemon-reload
  echo "automatic deploys removed"
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

systemctl daemon-reload
systemctl enable --now triviapig-deploy.timer
echo "automatic deploys installed; logs: journalctl -u triviapig-deploy -f"

#!/usr/bin/env bash
# Monthly portal sync on this Mac: on the 1st of each month at 10:00 a browser
# window opens at the UTAR portal; sign in and the sync continues by itself
# (scripts/kb-portal-sync.mjs --apply). If the Mac is asleep then, it runs on wake.
#
#   bash scripts/install-portal-schedule.sh             # install / update
#   bash scripts/install-portal-schedule.sh --uninstall # remove
#   bash scripts/install-portal-schedule.sh --run-now   # start it once now
set -euo pipefail

LABEL="my.utarchat.kb-portal-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/.utarchat-kb"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the monthly portal sync."
  exit 0
fi

if [ "${1:-}" = "--run-now" ]; then
  launchctl kickstart "gui/$(id -u)/$LABEL"
  echo "Started. A browser window opens at the portal; log: $LOG_DIR/portal-sync.log"
  exit 0
fi

NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "node not found"; exit 1; }
grep -q '^DATABASE_URL=' "$REPO/.env.local" 2>/dev/null || echo "Note: add DATABASE_URL to $REPO/.env.local, or the monthly run will stop before publishing."
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/scripts/kb-portal-sync.mjs</string>
    <string>--apply</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG_DIR/portal-sync.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/portal-sync.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed: the portal sync starts on the 1st of each month at 10:00 (log: $LOG_DIR/portal-sync.log)."
echo "Remove with: bash scripts/install-portal-schedule.sh --uninstall"

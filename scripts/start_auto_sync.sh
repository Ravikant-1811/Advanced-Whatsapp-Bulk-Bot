#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/auto_sync.sh"
PID_FILE="$ROOT_DIR/.auto-sync.pid"
LOG_FILE="$ROOT_DIR/.auto-sync.log"
INTERVAL_SECONDS="${1:-3}"

if [[ ! -x "$SCRIPT_PATH" ]]; then
  chmod +x "$SCRIPT_PATH"
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "Auto sync is already running (PID: $OLD_PID)"
    exit 0
  fi
fi

nohup "$SCRIPT_PATH" "$INTERVAL_SECONDS" >> "$LOG_FILE" 2>&1 &
NEW_PID="$!"
echo "$NEW_PID" > "$PID_FILE"

echo "Auto sync started (PID: $NEW_PID)"
echo "Log file: $LOG_FILE"

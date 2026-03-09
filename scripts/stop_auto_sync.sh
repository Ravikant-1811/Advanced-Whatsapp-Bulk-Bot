#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.auto-sync.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Auto sync is not running."
  exit 0
fi

PID="$(cat "$PID_FILE")"

if ps -p "$PID" >/dev/null 2>&1; then
  kill "$PID"
  echo "Auto sync stopped (PID: $PID)"
else
  echo "Stale PID file removed (PID was: $PID)"
fi

rm -f "$PID_FILE"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${1:-3}"
RUN_ONCE="${AUTO_SYNC_ONCE:-0}"

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $ROOT_DIR" >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' is missing. Add it with: git remote add origin <url>" >&2
  exit 1
fi

echo "Auto sync running in: $ROOT_DIR (every ${INTERVAL_SECONDS}s)"

while true; do
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A

    if ! git diff --cached --quiet; then
      BRANCH_NAME="$(git symbolic-ref --short HEAD 2>/dev/null || echo master)"
      NOW="$(date '+%Y-%m-%d %H:%M:%S')"
      MESSAGE="chore: auto-sync ${NOW}"

      if git commit -m "$MESSAGE" >/dev/null 2>&1; then
        git push -u origin "$BRANCH_NAME" >/dev/null 2>&1 || \
          echo "[WARN] Push failed at ${NOW}. Check auth/network."
      else
        echo "[WARN] Commit failed at ${NOW}. Check git user.name/user.email."
      fi
    fi
  fi

  if [[ "$RUN_ONCE" == "1" ]]; then
    break
  fi

  sleep "$INTERVAL_SECONDS"
done

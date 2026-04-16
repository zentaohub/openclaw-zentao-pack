#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
TIMESLOT="${1:-}"
DIGEST_CONFIG_PATH="${OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH:-$REPO_DIR/scripts/scheduled_digest/scheduled-digest.json}"
LOG_DIR="${SCHEDULED_DIGEST_LOG_DIR:-$REPO_DIR/tmp/scheduled-digest-cron}"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
DATE_KEY="$(date '+%Y%m%d')"

if [[ "$TIMESLOT" != "morning" && "$TIMESLOT" != "evening" ]]; then
  echo "[scheduled-digest] usage: $0 morning|evening" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/${TIMESLOT}-${DATE_KEY}.log"

{
  echo "[$TIMESTAMP] scheduled digest start: $TIMESLOT"
  echo "[$TIMESTAMP] repo: $REPO_DIR"
  echo "[$TIMESTAMP] digest-config: $DIGEST_CONFIG_PATH"

  cd "$REPO_DIR"

  if [[ -n "${OPENCLAW_ZENTAO_CONFIG_PATH:-}" ]]; then
    echo "[$TIMESTAMP] zentao-config: $OPENCLAW_ZENTAO_CONFIG_PATH"
  fi

  export OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH="$DIGEST_CONFIG_PATH"

  npm run run-scheduled-digest -- --timeslot "$TIMESLOT"

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] scheduled digest finished: $TIMESLOT"
} >>"$LOG_FILE" 2>&1

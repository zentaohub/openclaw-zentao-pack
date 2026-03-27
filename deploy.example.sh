#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/openclaw-zentao-pack}"
CONFIG_PATH="${OPENCLAW_ZENTAO_CONFIG_PATH:-/etc/openclaw/zentao.config.json}"

if [ ! -d "$REPO_DIR" ]; then
  echo "Repository directory not found: $REPO_DIR" >&2
  exit 1
fi

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Config file not found: $CONFIG_PATH" >&2
  exit 1
fi

export OPENCLAW_ZENTAO_CONFIG_PATH="$CONFIG_PATH"

echo "[deploy] repo: $REPO_DIR"
echo "[deploy] config: $OPENCLAW_ZENTAO_CONFIG_PATH"

cd "$REPO_DIR"
git pull
npm install
npm run build

echo "[deploy] done"

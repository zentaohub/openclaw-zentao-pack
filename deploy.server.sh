#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/.openclaw/workspace/skills/openclaw-zentao-pack}"
BRANCH="${BRANCH:-main}"
CONFIG_PATH="${OPENCLAW_ZENTAO_CONFIG_PATH:-/root/.openclaw/private/zentao.config.json}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Git repository not found: $REPO_DIR" >&2
  exit 1
fi

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Config file not found: $CONFIG_PATH" >&2
  exit 1
fi

export OPENCLAW_ZENTAO_CONFIG_PATH="$CONFIG_PATH"

echo "[update] repo: $REPO_DIR"
echo "[update] branch: $BRANCH"
echo "[update] config: $OPENCLAW_ZENTAO_CONFIG_PATH"

cd "$REPO_DIR"

echo "[update] fetching latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[update] installing dependencies"
npm install

echo "[update] building project"
npm run build

echo "[update] done"

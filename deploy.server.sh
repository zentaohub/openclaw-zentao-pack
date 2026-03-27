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

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "[update] switching branch: $CURRENT_BRANCH -> $BRANCH"
fi

DIRTY_FILES="$(git status --porcelain --untracked-files=no)"
if [ -n "$DIRTY_FILES" ]; then
  NON_LOCK_DIRTY="$(printf '%s\n' "$DIRTY_FILES" | grep -v ' package-lock.json$' || true)"
  if [ -n "$NON_LOCK_DIRTY" ]; then
    echo "[update] working tree has local changes:" >&2
    printf '%s\n' "$NON_LOCK_DIRTY" >&2
    echo "[update] aborting to avoid overwriting local modifications" >&2
    exit 1
  fi

  echo "[update] reverting package-lock.json before pull"
  git checkout -- package-lock.json
fi

echo "[update] fetching latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[update] installing dependencies"
npm install

echo "[update] building project"
npm run build

echo "[update] done"

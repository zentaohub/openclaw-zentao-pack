#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

HOOKS_DIR="$ROOT/.githooks"
if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "hooks directory not found: $HOOKS_DIR" >&2
  exit 1
fi

if ! git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "git repository not found at: $ROOT" >&2
  exit 1
fi

git -C "$ROOT" config core.hooksPath "$HOOKS_DIR"
printf 'INSTALLED_GIT_HOOKS %s\n' "$HOOKS_DIR"

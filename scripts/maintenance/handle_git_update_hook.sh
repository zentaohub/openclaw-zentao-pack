#!/usr/bin/env bash
set -euo pipefail

EVENT="${1:-}"
shift >/dev/null 2>&1 || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "${ROOT//[[:space:]]/}" ]] || exit 0

should_enable_hook() {
  [[ "${OPENCLAW_GIT_UPDATE_HOOK_DISABLE:-0}" == "1" ]] && return 1
  [[ "${OPENCLAW_GIT_UPDATE_HOOK_FORCE:-0}" == "1" ]] && return 0
  [[ "$ROOT" == "/root/.openclaw/workspace/skills/openclaw-zentao-pack" ]]
}

should_auto_push() {
  if [[ "${OPENCLAW_GIT_UPDATE_HOOK_PUSH:-}" == "1" ]]; then
    return 0
  fi
  if [[ "${OPENCLAW_GIT_UPDATE_HOOK_PUSH:-}" == "0" ]]; then
    return 1
  fi
  [[ "$ROOT" == "/root/.openclaw/workspace/skills/openclaw-zentao-pack" ]]
}

resolve_range() {
  local event="$1"
  shift || true

  case "$event" in
    post-merge)
      local old_commit new_commit
      old_commit="$(git rev-parse -q --verify ORIG_HEAD 2>/dev/null || true)"
      new_commit="$(git rev-parse -q --verify HEAD 2>/dev/null || true)"
      printf '%s\n%s\n%s\n' "$old_commit" "$new_commit" "git pull/merge"
      ;;
    post-checkout)
      local old_commit="${1:-}"
      local new_commit="${2:-}"
      local is_branch_checkout="${3:-0}"
      if [[ "$is_branch_checkout" != "1" ]]; then
        return
      fi
      printf '%s\n%s\n%s\n' "$old_commit" "$new_commit" "git checkout/switch"
      ;;
    post-rewrite)
      local rewrite_source="${1:-rebase}"
      local old_commit new_commit
      old_commit="$(git rev-parse -q --verify ORIG_HEAD 2>/dev/null || true)"
      new_commit="$(git rev-parse -q --verify HEAD 2>/dev/null || true)"
      printf '%s\n%s\n%s\n' "$old_commit" "$new_commit" "git ${rewrite_source}"
      ;;
  esac
}

normalize_commit() {
  local value="${1:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    return
  fi
  if [[ "$value" =~ ^0+$ ]]; then
    return
  fi
  printf '%s\n' "$value"
}

main() {
  should_enable_hook || exit 0
  [[ -n "${EVENT//[[:space:]]/}" ]] || exit 0

  local resolved old_commit new_commit source log_path record_output record_status branch push_output
  resolved="$(resolve_range "$EVENT" "$@")"
  old_commit="$(normalize_commit "$(printf '%s\n' "$resolved" | sed -n '1p')")"
  new_commit="$(normalize_commit "$(printf '%s\n' "$resolved" | sed -n '2p')")"
  source="$(printf '%s\n' "$resolved" | sed -n '3p')"
  source="${source:-git update}"

  [[ -n "${old_commit//[[:space:]]/}" ]] || exit 0
  [[ -n "${new_commit//[[:space:]]/}" ]] || exit 0
  [[ "$old_commit" != "$new_commit" ]] || exit 0

  cd "$ROOT"
  log_path="docs/overview/服务器变更日志.md"

  set +e
  record_output="$(python3 "$ROOT/scripts/maintenance/record_server_change_after_update.py" "$old_commit" "$new_commit" --source "$source" 2>&1)"
  record_status=$?
  set -e

  if [[ -n "${record_output//[[:space:]]/}" ]]; then
    printf '[git-update-hook] %s\n' "$record_output"
  fi

  if [[ "$record_status" -ne 0 ]]; then
    exit 0
  fi

  git add "$log_path" >/dev/null 2>&1 || true
  if [[ -z "$(git diff --cached --name-only -- "$log_path")" ]]; then
    exit 0
  fi

  git commit -m "维护: 补记服务器更新日志 ${new_commit:0:7}" >/dev/null 2>&1 || exit 0

  if ! should_auto_push; then
    printf '[git-update-hook] log committed locally: %s\n' "${new_commit:0:7}"
    exit 0
  fi

  branch="$(git branch --show-current 2>/dev/null || true)"
  [[ -n "${branch//[[:space:]]/}" ]] || exit 0
  git config --get remote.origin.url >/dev/null 2>&1 || exit 0

  set +e
  push_output="$(git push origin "HEAD:refs/heads/$branch" 2>&1)"
  set -e
  if [[ -n "${push_output//[[:space:]]/}" ]]; then
    printf '[git-update-hook] %s\n' "$push_output"
  fi
}

main "$@"

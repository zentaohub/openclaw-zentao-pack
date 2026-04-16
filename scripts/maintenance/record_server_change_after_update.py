#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_REPO = Path("/root/.openclaw/workspace/skills/openclaw-zentao-pack")
REPO = DEFAULT_REPO if DEFAULT_REPO.exists() else Path(__file__).resolve().parents[2]
LOG_REL = ("docs/overview/" + "\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7.md").encode("utf-8").decode("unicode_escape")
LOG = REPO / LOG_REL
CST = timezone(timedelta(hours=8), name="CST")


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=REPO, text=True, encoding="utf-8", errors="replace").strip()


def git_run(*args: str) -> str:
    return run("git", "-c", "i18n.logOutputEncoding=utf-8", *args)


def normalize_text(text: str) -> str:
    if not text:
        return text
    try:
        repaired = text.encode("latin1").decode("utf-8")
    except UnicodeError:
        return text
    if repaired != text and any("\u4e00" <= ch <= "\u9fff" for ch in repaired):
        return repaired
    return text


def now_cst() -> str:
    return datetime.now(CST).strftime("%Y-%m-%d %H:%M CST")


def get_changed_files(old_commit: str, new_commit: str) -> list[str]:
    raw = git_run("-c", "core.quotepath=false", "diff", "--name-only", old_commit, new_commit)
    return [line.strip() for line in raw.splitlines() if line.strip()]


def get_commit_subjects(old_commit: str, new_commit: str) -> list[str]:
    raw = git_run("log", "--reverse", "--format=%s", f"{old_commit}..{new_commit}")
    return [normalize_text(line.strip()) for line in raw.splitlines() if line.strip()]


def pick_key_files(files: list[str], limit: int = 6) -> list[str]:
    priority = [
        "scripts/maintenance/",
        "scripts/callbacks/",
        "scripts/shared/",
        "scripts/actions/",
        "agents/modules/",
        "docs/integration/",
        "docs/overview/",
        "AGENTS.md",
        "package.json",
    ]
    ranked: list[str] = []
    seen: set[str] = set()
    for prefix in priority:
        for file in files:
            if file in seen:
                continue
            if file == prefix or file.startswith(prefix):
                ranked.append(file)
                seen.add(file)
                if len(ranked) >= limit:
                    return ranked
    for file in files:
        if file in seen:
            continue
        ranked.append(file)
        if len(ranked) >= limit:
            break
    return ranked


def build_change_summary(source: str, subjects: list[str], commit_count: int, new_short: str) -> str:
    if not subjects:
        return f"通过 {source} 更新到 `{new_short}`，详情见 git diff。"

    if commit_count == 1:
        return f"通过 {source} 更新到 `{new_short}`：{subjects[0]}"

    preview = "；".join(subjects[:3])
    if commit_count > 3:
        preview += f"；另 {commit_count - 3} 个提交"
    return f"通过 {source} 更新 {commit_count} 个提交到 `{new_short}`：{preview}"


def insert_entry(log_text: str, entry: str) -> str:
    match = re.search(r"^##\s+", log_text, flags=re.MULTILINE)
    if match:
        index = match.start()
        prefix = log_text[:index].rstrip() + "\n\n"
        suffix = log_text[index:].lstrip()
        return prefix + entry.rstrip() + "\n\n" + suffix
    base = log_text.rstrip() or ("# " + "\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7").encode("utf-8").decode("unicode_escape")
    return base + "\n\n" + entry.rstrip() + "\n"


def build_entry(
    *,
    old_commit: str,
    new_commit: str,
    source: str,
    changed_files: list[str],
    subjects: list[str],
) -> str:
    old_short = old_commit[:7]
    new_short = new_commit[:7]
    title = now_cst()
    separator = "、"
    empty_text = "见 git diff"
    key_files = pick_key_files(changed_files)
    files_text = separator.join(f"`{item}`" for item in key_files) if key_files else empty_text
    commit_count = len(subjects)
    change_summary = build_change_summary(source, subjects, commit_count, new_short)
    return "\n".join(
        [
            f"## {title}",
            "",
            f"- 时间：{title}",
            "- 来源：Server Git Hook / 更新后自动记录",
            "- 范围：skill级 / openclaw-zentao-pack",
            f"- 位置：{files_text}",
            f"- 变更：{change_summary}",
            f"- 原因：检测到 Git 更新导致 HEAD 从 `{old_short}` 变为 `{new_short}`，需要对 skill 服务器更新留痕。",
            f"- 验证：已确认 HEAD 从 `{old_short}` 更新到 `{new_short}`；如需完整文件清单请查看 `git diff --stat {old_short} {new_short}`。",
            "- 影响范围：以本次 Git 更新 diff 为准。",
            f"- 附加结果：update_range={old_short}..{new_short} head={new_short} commits={commit_count} source={source}",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("old_commit")
    parser.add_argument("new_commit")
    parser.add_argument("--source", default="git pull")
    args = parser.parse_args()

    old_commit = args.old_commit.strip()
    new_commit = args.new_commit.strip()
    if not old_commit or not new_commit or old_commit == new_commit:
        print("SERVER_UPDATE_SKIP_EMPTY_RANGE")
        return 0

    log_text = LOG.read_text(encoding="utf-8") if LOG.exists() else "# 服务器变更日志\n\n"
    old_short = old_commit[:7]
    new_short = new_commit[:7]
    marker = f"update_range={old_short}..{new_short}"
    if marker in log_text:
        print(f"SERVER_UPDATE_ALREADY_RECORDED {old_short}..{new_short}")
        return 0

    changed_files = get_changed_files(old_commit, new_commit)
    tracked_files = [item for item in changed_files if item != LOG_REL]
    if not tracked_files:
        print(f"SERVER_UPDATE_SKIP_LOG_ONLY {old_short}..{new_short}")
        return 0

    subjects = get_commit_subjects(old_commit, new_commit)
    entry = build_entry(
        old_commit=old_commit,
        new_commit=new_commit,
        source=args.source,
        changed_files=tracked_files,
        subjects=subjects,
    )
    new_text = insert_entry(log_text, entry)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(new_text if new_text.endswith("\n") else new_text + "\n", encoding="utf-8")
    print(f"SERVER_UPDATE_RECORDED {old_short}..{new_short}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

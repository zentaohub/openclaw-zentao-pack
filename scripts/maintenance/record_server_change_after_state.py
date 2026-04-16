#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_REPO = Path("/root/.openclaw/workspace/skills/openclaw-zentao-pack")
REPO = DEFAULT_REPO if DEFAULT_REPO.exists() else Path(__file__).resolve().parents[2]
LOG_REL = "docs/overview/服务器变更日志.md"
LOG = REPO / LOG_REL
CST = timezone(timedelta(hours=8), name="CST")


def now_cst() -> str:
    return datetime.now(CST).strftime("%Y-%m-%d %H:%M CST")


def read_snapshot(path_file: str) -> dict[str, str]:
    path = Path(path_file)
    if not path.exists():
        return {}
    snapshot: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item, _, digest = line.partition("\t")
        snapshot[item.strip()] = digest.strip()
    return snapshot


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


def insert_entry(log_text: str, entry: str) -> str:
    match = re.search(r"^##\s+", log_text, flags=re.MULTILINE)
    if match:
        index = match.start()
        prefix = log_text[:index].rstrip() + "\n\n"
        suffix = log_text[index:].lstrip()
        return prefix + entry.rstrip() + "\n\n" + suffix
    base = log_text.rstrip() or "# 服务器变更日志"
    return base + "\n\n" + entry.rstrip() + "\n"


def build_entry(*, source: str, head_before: str, head_after: str, touched_paths: list[str]) -> str:
    title = now_cst()
    key_files = pick_key_files(touched_paths)
    files_text = "、".join(f"`{item}`" for item in key_files) if key_files else "见命令结果"
    head_label = head_after[:7] if head_after else (head_before[:7] if head_before else "no-head")
    same_head = bool(head_before and head_after and head_before == head_after)
    reason = (
        f"检测到 `{source}` 改写了 skill 服务器工作区文件，虽然 HEAD 仍为 `{head_label}`，也需要补记服务器变更。"
        if same_head
        else f"检测到 `{source}` 改写了 skill 服务器工作区文件，当前 HEAD 为 `{head_label}`，需要补记服务器变更。"
    )
    verify = f"已根据命令前后受影响路径生成记录；如需细节请复核 `{source}` 的执行结果。"
    return "\n".join(
        [
            f"## {title}",
            "",
            f"- 时间：{title}",
            "- 来源：Server Git Wrapper / 状态变更后自动记录",
            "- 范围：skill级 / openclaw-zentao-pack",
            f"- 位置：{files_text}",
            f"- 变更：执行 `{source}` 后影响 {len(touched_paths)} 个路径，已按 skill 服务器状态变更留痕。",
            f"- 原因：{reason}",
            f"- 验证：{verify}",
            "- 影响范围：以本次命令实际改写的服务器文件为准。",
            f"- 附加结果：state_change=working_tree source={source} head_before={head_before[:7] if head_before else 'none'} head_after={head_after[:7] if head_after else 'none'} paths={len(touched_paths)}",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--head-before", default="")
    parser.add_argument("--head-after", default="")
    parser.add_argument("--paths-before-file", required=True)
    parser.add_argument("--paths-after-file", required=True)
    args = parser.parse_args()

    before_paths = read_snapshot(args.paths_before_file)
    after_paths = read_snapshot(args.paths_after_file)
    touched_paths = sorted(
        path
        for path in set(before_paths) | set(after_paths)
        if path != LOG_REL and before_paths.get(path) != after_paths.get(path)
    )
    if not touched_paths:
        print("SERVER_STATE_SKIP_EMPTY")
        return 0

    marker = f"state_change=working_tree source={args.source} head_before={args.head_before[:7] if args.head_before else 'none'} head_after={args.head_after[:7] if args.head_after else 'none'} paths={len(touched_paths)}"
    log_text = LOG.read_text(encoding="utf-8") if LOG.exists() else "# 服务器变更日志\n\n"
    if marker in log_text:
        print("SERVER_STATE_ALREADY_RECORDED")
        return 0

    entry = build_entry(
        source=args.source,
        head_before=args.head_before,
        head_after=args.head_after,
        touched_paths=touched_paths,
    )
    new_text = insert_entry(log_text, entry)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(new_text if new_text.endswith("\n") else new_text + "\n", encoding="utf-8")
    print(f"SERVER_STATE_RECORDED {len(touched_paths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

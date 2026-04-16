#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

DEFAULT_REPO = Path('/root/.openclaw/workspace/skills/openclaw-zentao-pack')
REPO = DEFAULT_REPO if DEFAULT_REPO.exists() else Path(__file__).resolve().parents[2]
LOG_REL = ('docs/overview/' + '\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7.md').encode('utf-8').decode('unicode_escape')
LOG = REPO / LOG_REL


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=REPO, text=True, encoding='utf-8', errors='replace').strip()


def git_run(*args: str) -> str:
    return run('git', '-c', 'i18n.logOutputEncoding=utf-8', *args)


def normalize_text(text: str) -> str:
    if not text:
        return text
    try:
        repaired = text.encode('latin1').decode('utf-8')
    except UnicodeError:
        return text
    if repaired != text and any('\u4e00' <= ch <= '\u9fff' for ch in repaired):
        return repaired
    return text


def get_commit(commit: str) -> dict[str, str]:
    raw = run(
        'git',
        '-c',
        'i18n.logOutputEncoding=utf-8',
        'show',
        '-s',
        '--format=%H%n%s%n%ad',
        '--date=format:%Y-%m-%d %H:%M CST',
        commit,
    )
    full_hash, subject, commit_time = raw.splitlines()
    return {'hash': full_hash, 'subject': normalize_text(subject), 'time': commit_time}


def get_changed_files(commit: str) -> list[str]:
    raw = git_run('-c', 'core.quotepath=false', 'show', '--name-only', '--format=', commit)
    return [line.strip() for line in raw.splitlines() if line.strip()]


def pick_key_files(files: list[str], limit: int = 6) -> list[str]:
    priority = [
        'scripts/maintenance/',
        'scripts/callbacks/',
        'scripts/shared/',
        'scripts/actions/',
        'agents/modules/',
        'docs/integration/',
        'docs/overview/',
        'AGENTS.md',
        'package.json',
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


def build_entry(meta: dict[str, str], key_files: list[str]) -> str:
    title = meta['time']
    short_hash = meta['hash'][:7]
    separator = '、'
    empty_text = '见 git 提交'
    files_text = separator.join(f'`{item}`' for item in key_files) if key_files else empty_text
    lines = [
        f'## {title}',
        '',
        f'- 时间：{title}',
        '- 来源：Codex / 提交后自动记录',
        '- 范围：skill级 / openclaw-zentao-pack',
        f'- 位置：{files_text}',
        f'- 变更：{meta["subject"]}',
        '- 原因：本次功能改动已形成 git 提交，按完成节点自动留痕。',
        f'- 验证：已形成 git 提交 `{short_hash}`；如需完整文件清单请查看 `git show --stat {short_hash}`。',
        '- 影响范围：以本次提交 diff 为准。',
        f'- 附加结果：commit={short_hash} message={meta["subject"]}',
        '',
    ]
    return '\n'.join(lines)


def insert_entry(log_text: str, entry: str) -> str:
    match = re.search(r'^##\\s+', log_text, flags=re.MULTILINE)
    if match:
        index = match.start()
        prefix = log_text[:index].rstrip() + '\n\n'
        suffix = log_text[index:].lstrip()
        return prefix + entry.rstrip() + '\n\n' + suffix
    base = log_text.rstrip() or '\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7'.encode('utf-8').decode('unicode_escape')
    return base + '\n\n' + entry.rstrip() + '\n'


def main() -> int:
    commit = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
    meta = get_commit(commit)
    default_log = '# ' + '\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7'.encode('utf-8').decode('unicode_escape') + '\n\n'
    log_text = LOG.read_text(encoding='utf-8') if LOG.exists() else default_log
    short_hash = meta['hash'][:7]
    if f'commit={short_hash} ' in log_text or f'commit={short_hash}\n' in log_text:
        print(f'SERVER_CHANGE_ALREADY_RECORDED {short_hash}')
        return 0

    changed_files = get_changed_files(commit)
    if changed_files and set(changed_files).issubset({LOG_REL}):
        print(f'SERVER_CHANGE_SKIP_LOG_ONLY {short_hash}')
        return 0

    entry = build_entry(meta, pick_key_files(changed_files))
    new_text = insert_entry(log_text, entry)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(new_text if new_text.endswith('\n') else new_text + '\n', encoding='utf-8')
    print(f'SERVER_CHANGE_RECORDED {short_hash}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

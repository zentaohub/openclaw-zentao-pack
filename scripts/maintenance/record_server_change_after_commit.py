#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path('/root/.openclaw/workspace/skills/openclaw-zentao-pack')
LOG_REL = ('docs/overview/' + '\\u670d\\u52a1\\u5668\\u53d8\\u66f4\\u65e5\\u5fd7.md').encode('utf-8').decode('unicode_escape')
LOG = REPO / LOG_REL


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=REPO, text=True).strip()


def get_commit(commit: str) -> dict[str, str]:
    raw = run(
        'git',
        'show',
        '-s',
        '--format=%H%n%s%n%ad',
        '--date=format:%Y-%m-%d %H:%M CST',
        commit,
    )
    full_hash, subject, commit_time = raw.splitlines()
    return {'hash': full_hash, 'subject': subject, 'time': commit_time}


def get_changed_files(commit: str) -> list[str]:
    raw = run('git', '-c', 'core.quotepath=false', 'show', '--name-only', '--format=', commit)
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
    separator = '\\u3001'.encode('utf-8').decode('unicode_escape')
    empty_text = '\\u89c1 git \\u63d0\\u4ea4'.encode('utf-8').decode('unicode_escape')
    files_text = separator.join(f'`{item}`' for item in key_files) if key_files else empty_text
    lines = [
        f'## {title}',
        '',
        f'- \\u65f6\\u95f4\\uff1a{title}'.encode('utf-8').decode('unicode_escape'),
        '- \\u6765\\u6e90\\uff1aCodex / \\u63d0\\u4ea4\\u540e\\u81ea\\u52a8\\u8bb0\\u5f55'.encode('utf-8').decode('unicode_escape'),
        '- \\u8303\\u56f4\\uff1askill\\u7ea7 / openclaw-zentao-pack'.encode('utf-8').decode('unicode_escape'),
        f'- \\u4f4d\\u7f6e\\uff1a{files_text}'.encode('utf-8').decode('unicode_escape'),
        f'- \\u53d8\\u66f4\\uff1a{meta["subject"]}'.encode('utf-8').decode('unicode_escape'),
        '- \\u539f\\u56e0\\uff1a\\u672c\\u6b21\\u529f\\u80fd\\u6539\\u52a8\\u5df2\\u5f62\\u6210 git \\u63d0\\u4ea4\\uff0c\\u6309\\u5b8c\\u6210\\u8282\\u70b9\\u81ea\\u52a8\\u7559\\u75d5\\u3002'.encode('utf-8').decode('unicode_escape'),
        f'- \\u9a8c\\u8bc1\\uff1a\\u5df2\\u5f62\\u6210 git \\u63d0\\u4ea4 `{short_hash}`\\uff1b\\u5982\\u9700\\u5b8c\\u6574\\u6587\\u4ef6\\u6e05\\u5355\\u8bf7\\u67e5\\u770b `git show --stat {short_hash}`\\u3002'.encode('utf-8').decode('unicode_escape'),
        '- \\u5f71\\u54cd\\u8303\\u56f4\\uff1a\\u4ee5\\u672c\\u6b21\\u63d0\\u4ea4 diff \\u4e3a\\u51c6\\u3002'.encode('utf-8').decode('unicode_escape'),
        f'- \\u9644\\u52a0\\u7ed3\\u679c\\uff1acommit={short_hash} message={meta["subject"]}'.encode('utf-8').decode('unicode_escape'),
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
    LOG.write_text(new_text if new_text.endswith('\n') else new_text + '\n', encoding='utf-8')
    print(f'SERVER_CHANGE_RECORDED {short_hash}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

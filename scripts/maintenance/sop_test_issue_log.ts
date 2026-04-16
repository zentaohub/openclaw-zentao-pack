import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_SOP_LOG_RELATIVE_PATH = "docs/ops/测试问题SOP清单.md";
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const RECORD_MARKER = "## 问题记录";

export interface SopTestIssueEntryInput {
  title: string;
  source: "auto" | "manual";
  category?: string;
  command?: string;
  cwd?: string;
  expected?: string;
  actual?: string;
  analysis?: string;
  nextAction?: string;
  owner?: string;
  tags?: string[];
  stdout?: string;
  stderr?: string;
  note?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, "package.json")) && existsSync(path.join(current, "scripts"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function formatShanghaiNow(): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")} ${lookup.get("hour")}:${lookup.get("minute")} CST`;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function normalizeMultiline(text: string | undefined, fallback: string): string {
  const normalized = text?.trim();
  return normalized ? normalized : fallback;
}

function truncateText(text: string | undefined, maxLines: number, maxChars: number): string | null {
  if (!text) {
    return null;
  }

  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const lines = normalized.split(/\r?\n/);
  const limitedLines = lines.slice(0, maxLines);
  let truncated = limitedLines.join("\n");

  if (truncated.length > maxChars) {
    truncated = `${truncated.slice(0, maxChars)}\n...<已截断>`;
  } else if (lines.length > maxLines) {
    truncated = `${truncated}\n...<已截断，共 ${lines.length} 行>`;
  }

  return truncated;
}

function formatCodeFence(text: string): string {
  return text.replace(/```/g, "'''");
}

function buildInitialDocument(): string {
  return `# 测试问题 SOP 清单

这个文件用于在本地记录测试、联调、回归过程中发现的问题，便于后续追踪、复盘和回填禅道。

## 使用规则

- 用户已经明确描述现场问题时，先记录问题，不默认要求代理重新执行或复现。
- 命令执行失败时，可以使用自动记录命令，让失败信息直接追加到本文件。
- 命令执行成功但结果不符合预期，或问题发生在真实使用场景中时，使用手工记录命令补记。
- 每条问题至少补齐：现象、期望、实际、初步判断、下一步动作。
- 新问题默认追加在“问题记录”顶部，方便先看最新问题。

## 推荐命令

- 现场问题直接记录：\`npm run log-test-issue -- --title "企微消息未生成卡片记录" --expected "发送企微消息后自动生成卡片记录" --actual "消息已发送，但系统没有生成卡片记录" --analysis "可能是企微回调未命中卡片落盘链路" --next-action "检查企微回调日志、卡片生成逻辑和落盘条件" --tags "企微,卡片,现场问题"\`
- 自动记录：\`npm run test-with-sop-log -- --title "联调企微回调失败" --cmd "npm run wecom-callback -- --data-file examples/callbacks/tmp-callback-task.json"\`
- 手工记录：\`npm run log-test-issue -- --title "测试单状态未更新" --actual "接口返回成功但页面仍显示进行中" --command "npm run update-testtask-status -- --testtask 1 --status done"\`

## 给 AI 的提示词

\`\`\`text
你现在是这个仓库的测试协作助手。每次执行测试、联调、回归时，必须遵循以下规则：
1. 如果用户已经明确描述了现场问题，先把问题追加到 docs/ops/测试问题SOP清单.md，不要默认自行执行命令复现；只有用户明确要求联调、复现、排查时才执行命令。
2. 只要出现命令失败、接口报错、页面行为不符、数据未落库、返回值异常，或者用户反馈“真实操作中出了问题”，都要记录到 docs/ops/测试问题SOP清单.md。
3. 用户口述或人工观察到的问题，优先执行：
   npm run log-test-issue -- --title "<一句话标题>" --expected "<期望结果>" --actual "<实际结果>" --analysis "<初步判断>" --next-action "<下一步动作>"
4. 如果命令退出码非 0，优先执行：
   npm run test-with-sop-log -- --title "<一句话标题>" --cmd "<实际执行的测试命令>" --expected "<期望结果>" --next-action "<下一步动作>"
5. 如果命令执行成功但结果仍有问题，执行：
   npm run log-test-issue -- --title "<一句话标题>" --command "<实际执行的命令>" --expected "<期望结果>" --actual "<实际结果>" --analysis "<初步判断>" --next-action "<下一步动作>"
6. 回复用户时，先说明问题结论，再明确告诉用户该问题已经写入 docs/ops/测试问题SOP清单.md。
7. 除非用户明确要求跳过，否则不要省略问题记录步骤。
\`\`\`

## 常用归档提示词

### 1. 已经分析完，先记录，不继续修复

\`\`\`text
基于你刚才已经给出的原因分析，现在先不要继续修复，也不要继续执行复现、联调或排查命令。

请把“本次问题”先整理并记录到 \`docs/ops/测试问题SOP清单.md\`，方便我后续逐项处理。

要求：
1. 直接基于你刚才已经输出的结论整理，不要重复排查。
2. 记录内容至少包括：
   - title：一句话问题标题
   - expected：期望结果
   - actual：实际结果
   - analysis：你刚才判断的原因总结
   - next-action：后续修复或排查建议
3. 不要编造新的日志、截图、执行结果。
4. 不要继续修复，只做记录。
5. 直接执行：
   npm run log-observed-issue -- --title "<title>" --expected "<expected>" --actual "<actual>" --analysis "<analysis>" --next-action "<next-action>" --tags "待修复,问题归档,现场问题"
6. 完成后只回复我：
   - 本次问题摘要
   - 已写入 docs/ops/测试问题SOP清单.md
   - 建议后续修复优先级
\`\`\`

### 2. 已知现场现象，先记录，不先复现

\`\`\`text
你现在先不要执行任何复现命令，也不要主动联调。

请基于我刚才描述的问题，先整理出一条“问题记录”，并立即写入 \`docs/ops/测试问题SOP清单.md\`。

要求：
1. 先把这次问题整理成这几个字段：
   - title：一句话问题标题
   - expected：期望结果
   - actual：实际结果
   - analysis：你判断的可能原因
   - next-action：建议下一步排查动作
2. 如果我提供的信息不完整，你可以做最小必要假设，但要写得保守，不要编造执行结果。
3. 不要先复现，不要先跑命令。
4. 直接执行记录命令，把问题写入 SOP：
   npm run log-observed-issue -- --title "<title>" --expected "<expected>" --actual "<actual>" --analysis "<analysis>" --next-action "<next-action>" --tags "现场问题,待排查"
5. 回复我时只需要告诉我：
   - 你整理后的问题摘要
   - 你已经写入 docs/ops/测试问题SOP清单.md
   - 建议我下一步是否需要你继续排查
\`\`\`

### 3. 超短口语版

\`\`\`text
把你刚才已经分析出的结论先归档，不要继续修复，不要继续跑命令。请直接整理为问题记录，并写入 docs/ops/测试问题SOP清单.md。使用 npm run log-observed-issue 完成记录，回复我摘要、记录位置和建议优先级即可。
\`\`\`

## 问题记录
`;
}

function buildEntry(input: SopTestIssueEntryInput): string {
  const timestamp = formatShanghaiNow();
  const category = input.category?.trim() || "测试异常";
  const expected = normalizeMultiline(input.expected, "命令执行成功，结果符合预期。");
  const actual = normalizeMultiline(input.actual, "待补充。");
  const analysis = normalizeMultiline(input.analysis, "待补充。");
  const nextAction = normalizeMultiline(input.nextAction, "待补充。");
  const owner = input.owner?.trim() || "待分配";
  const tags = (input.tags ?? []).map((item) => item.trim()).filter(Boolean);
  const stdout = truncateText(input.stdout, 80, 4000);
  const stderr = truncateText(input.stderr, 80, 4000);
  const note = truncateText(input.note, 40, 2000);
  const resultSummary = [
    input.exitCode === null || input.exitCode === undefined ? null : `exit_code=${input.exitCode}`,
    input.signal ? `signal=${input.signal}` : null,
  ].filter(Boolean).join(" ");

  const lines = [
    `### ${timestamp} | ${input.title.trim()}`,
    `- 状态：待处理`,
    `- 记录来源：${input.source === "auto" ? "自动记录" : "手工记录"}`,
    `- 分类：${category}`,
    `- 期望结果：${expected}`,
    `- 实际结果：${actual}`,
    `- 初步判断：${analysis}`,
    `- 下一步动作：${nextAction}`,
    `- 跟进人：${owner}`,
    `- 发生目录：\`${input.cwd?.trim() || process.cwd()}\``,
  ];

  if (input.command?.trim()) {
    lines.push(`- 测试命令：\`${input.command.trim()}\``);
  }

  if (resultSummary) {
    lines.push(`- 命令结果：\`${resultSummary}\``);
  }

  if (tags.length > 0) {
    lines.push(`- 标签：${tags.map((item) => `\`${item}\``).join("、")}`);
  }

  if (note) {
    lines.push(`- 补充说明：${note}`);
  }

  if (stdout) {
    lines.push("", "- 标准输出摘录：", "```text", formatCodeFence(stdout), "```");
  }

  if (stderr) {
    lines.push("", "- 错误输出摘录：", "```text", formatCodeFence(stderr), "```");
  }

  return `${lines.join("\n")}\n`;
}

function insertEntry(documentText: string, entryText: string): string {
  const markerIndex = documentText.indexOf(RECORD_MARKER);
  if (markerIndex === -1) {
    return `${documentText.trimEnd()}\n\n${RECORD_MARKER}\n\n${entryText.trimEnd()}\n`;
  }

  const markerLineEnd = documentText.indexOf("\n", markerIndex);
  if (markerLineEnd === -1) {
    return `${documentText.trimEnd()}\n\n${entryText.trimEnd()}\n`;
  }

  const prefix = documentText.slice(0, markerLineEnd + 1);
  const suffix = documentText.slice(markerLineEnd + 1).replace(/^\s*/, "");
  return `${prefix}\n${entryText.trimEnd()}\n\n${suffix}`.replace(/\n{3,}/g, "\n\n");
}

export function resolveSopLogFile(customLogFile?: string, baseDir: string = process.cwd()): string {
  if (customLogFile?.trim()) {
    return path.resolve(baseDir, customLogFile.trim());
  }

  const repoRoot = findRepoRoot(baseDir);
  return path.join(repoRoot, DEFAULT_SOP_LOG_RELATIVE_PATH);
}

export function appendSopTestIssue(
  input: SopTestIssueEntryInput,
  options: {
    logFile?: string;
    baseDir?: string;
  } = {},
): { logFile: string; title: string; timestamp: string } {
  const baseDir = options.baseDir ?? process.cwd();
  const logFile = resolveSopLogFile(options.logFile, baseDir);
  const current = existsSync(logFile) ? readFileSync(logFile, "utf8") : buildInitialDocument();
  const entry = buildEntry(input);
  const updated = insertEntry(current, entry);

  mkdirSync(path.dirname(logFile), { recursive: true });
  writeFileSync(logFile, ensureTrailingNewline(updated), "utf8");

  return {
    logFile,
    title: input.title.trim(),
    timestamp: formatShanghaiNow(),
  };
}

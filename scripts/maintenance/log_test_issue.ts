import { parseArgs } from "node:util";
import { appendSopTestIssue } from "./sop_test_issue_log";
import { printJson } from "../shared/zentao_client";

function parseTags(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\s|，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      title: { type: "string" },
      category: { type: "string", default: "测试异常" },
      command: { type: "string" },
      expected: { type: "string", default: "命令执行成功，结果符合预期。" },
      actual: { type: "string", default: "测试结果与预期不符。" },
      analysis: { type: "string", default: "待补充。" },
      "next-action": { type: "string", default: "待补充。" },
      owner: { type: "string", default: "待分配" },
      tags: { type: "string" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      note: { type: "string" },
      cwd: { type: "string", default: process.cwd() },
      "log-file": { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.title?.trim()) {
    throw new Error("Missing required option --title");
  }

  const result = appendSopTestIssue(
    {
      title: values.title,
      source: "manual",
      category: values.category,
      command: values.command,
      cwd: values.cwd,
      expected: values.expected,
      actual: values.actual,
      analysis: values.analysis,
      nextAction: values["next-action"],
      owner: values.owner,
      tags: parseTags(values.tags),
      stdout: values.stdout,
      stderr: values.stderr,
      note: values.note,
    },
    {
      logFile: values["log-file"],
      baseDir: values.cwd,
    },
  );

  printJson({
    ok: true,
    logged: true,
    mode: "manual",
    logFile: result.logFile,
    title: result.title,
    timestamp: result.timestamp,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

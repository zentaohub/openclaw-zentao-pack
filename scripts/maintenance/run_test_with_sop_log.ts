import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { appendSopTestIssue } from "./sop_test_issue_log";
import { printJson } from "../shared/zentao_client";

interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\s|，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAutoActual(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  errorMessage?: string,
): string {
  if (errorMessage) {
    return `测试命令执行异常：${errorMessage}`;
  }
  if (signal) {
    return `测试命令被信号 ${signal} 中断。`;
  }
  if (exitCode === 0) {
    return "命令已成功执行。";
  }
  return `测试命令退出码为 ${exitCode ?? "null"}。`;
}

function runCommand(command: string, cwd: string, shellPath: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: shellPath,
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdoutChunks.push(text);
      process.stdout.write(text);
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolve({
        exitCode: null,
        signal: null,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        errorMessage: error.message,
      });
    });

    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cmd: { type: "string" },
      title: { type: "string" },
      category: { type: "string", default: "测试命令失败" },
      expected: { type: "string", default: "命令执行成功，退出码为 0，且结果符合预期。" },
      actual: { type: "string" },
      analysis: { type: "string", default: "待补充。" },
      "next-action": { type: "string", default: "检查错误输出，定位失败根因并继续修复。" },
      owner: { type: "string", default: "待分配" },
      tags: { type: "string" },
      note: { type: "string" },
      cwd: { type: "string", default: process.cwd() },
      shell: { type: "string", default: process.env.SHELL || "/bin/sh" },
      "log-file": { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.cmd?.trim()) {
    throw new Error("Missing required option --cmd");
  }

  const command = values.cmd.trim();
  const cwd = values.cwd;
  const result = await runCommand(command, cwd, values.shell);
  const failed = Boolean(result.errorMessage) || result.exitCode !== 0 || Boolean(result.signal);

  let logged = false;
  let logFile: string | undefined;
  if (failed) {
    const appended = appendSopTestIssue(
      {
        title: values.title?.trim() || command,
        source: "auto",
        category: values.category,
        command,
        cwd,
        expected: values.expected,
        actual: values.actual || buildAutoActual(result.exitCode, result.signal, result.errorMessage),
        analysis: values.analysis,
        nextAction: values["next-action"],
        owner: values.owner,
        tags: parseTags(values.tags),
        stdout: result.stdout,
        stderr: result.errorMessage ? `${result.stderr}\n${result.errorMessage}`.trim() : result.stderr,
        note: values.note,
        exitCode: result.exitCode,
        signal: result.signal,
      },
      {
        logFile: values["log-file"],
        baseDir: cwd,
      },
    );
    logged = true;
    logFile = appended.logFile;
  }

  printJson({
    ok: !failed,
    command,
    cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    logged,
    logFile,
  });

  process.exitCode = result.exitCode ?? 1;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

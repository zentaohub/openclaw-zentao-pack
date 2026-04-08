import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { downloadFile } from "../shared/file_fetcher";
import { parseTaskImportFile, type ParsedImportTaskRow } from "../shared/task_import_parser";
import { printJson, type JsonObject, type JsonValue, ZentaoClient } from "../shared/zentao_client";

interface ImportSource {
  buffer: Buffer;
  filename: string;
  sourceType: "file" | "url";
  sourceLabel: string;
}

interface ExistingExecutionTask {
  id: number | null;
  name: string;
}

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) {
    throw new Error(`Missing required option --${optionName}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Option --${optionName} must be a valid positive number`);
  }
  return Math.floor(parsed);
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Option --${optionName} must be a valid number`);
  }
  return parsed;
}

async function loadImportSource(values: Record<string, string | boolean | undefined>): Promise<ImportSource> {
  const sourceFile = values["source-file"];
  const sourceUrl = values["source-url"];

  if (typeof sourceFile === "string" && sourceFile.trim()) {
    return {
      buffer: readFileSync(sourceFile),
      filename: basename(sourceFile),
      sourceType: "file",
      sourceLabel: sourceFile,
    };
  }

  if (typeof sourceUrl === "string" && sourceUrl.trim()) {
    const downloaded = await downloadFile(sourceUrl);
    return {
      buffer: downloaded.buffer,
      filename: downloaded.filename,
      sourceType: "url",
      sourceLabel: downloaded.sourceUrl,
    };
  }

  throw new Error("Missing required option --source-file or --source-url");
}

function buildTaskPayload(
  execution: number,
  row: ParsedImportTaskRow,
  fallbackAssignedTo: string,
  fallbackType: string,
): JsonObject {
  const payload: JsonObject = {
    execution,
    name: row.name,
    assignedTo: row.assignedTo ?? fallbackAssignedTo,
    type: row.type ?? fallbackType,
    desc: row.desc ?? "",
  };

  if (row.estimate !== undefined) {
    payload.estimate = row.estimate;
  }
  if (row.pri !== undefined) {
    payload.pri = row.pri;
  }
  if (row.estStarted !== undefined) {
    payload.estStarted = row.estStarted;
  }
  if (row.deadline !== undefined) {
    payload.deadline = row.deadline;
  }
  if (row.module !== undefined) {
    payload.module = row.module;
  }
  if (row.story !== undefined) {
    payload.story = row.story;
  }
  if (row.keywords !== undefined) {
    payload.keywords = row.keywords;
  }

  return payload;
}

function extractExecutionTasks(value: JsonValue | undefined): ExistingExecutionTask[] {
  const sourceItems = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];

  return sourceItems
    .filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === "number" ? item.id : Number.isFinite(Number(item.id)) ? Number(item.id) : null,
      name: typeof item.name === "string" ? item.name.trim() : "",
    }))
    .filter((item) => item.name);
}

async function loadExistingTaskNames(client: ZentaoClient, execution: number): Promise<Map<string, ExistingExecutionTask[]>> {
  const data = await client.getWebJsonViewData(`/execution-task-${execution}.json`);
  const tasks = extractExecutionTasks(data.tasks);
  const taskMap = new Map<string, ExistingExecutionTask[]>();

  for (const task of tasks) {
    const normalizedName = task.name.trim().toLowerCase();
    const existing = taskMap.get(normalizedName) ?? [];
    existing.push(task);
    taskMap.set(normalizedName, existing);
  }

  return taskMap;
}

function buildReplyText(summary: {
  execution: number;
  filename: string;
  sourceType: "file" | "url";
  successCount: number;
  skippedCount: number;
  failedCount: number;
  totalRows: number;
  skipped: Array<{ rowNumber: number; taskName: string; reason: string }>;
  failures: Array<{ rowNumber: number; error: string }>;
}): string {
  const lines = [
    `批量导入任务完成，目标执行：${summary.execution}`,
    `来源：${summary.sourceType === "url" ? "URL" : "本地文件"} ${summary.filename}`,
    `总行数：${summary.totalRows}`,
    `成功创建：${summary.successCount}`,
    `跳过行数：${summary.skippedCount}`,
    `失败行数：${summary.failedCount}`,
  ];

  if (summary.skipped.length > 0) {
    lines.push("跳过明细：");
    lines.push(
      ...summary.skipped.slice(0, 10).map((item) => `第 ${item.rowNumber} 行：${item.taskName}，${item.reason}`),
    );
  }

  if (summary.failures.length > 0) {
    lines.push("失败明细：");
    lines.push(
      ...summary.failures.slice(0, 10).map((item) => `第 ${item.rowNumber} 行：${item.error}`),
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      execution: { type: "string" },
      userid: { type: "string" },
      "source-file": { type: "string" },
      "source-url": { type: "string" },
      "assigned-to": { type: "string" },
      type: { type: "string", default: "devel" },
      "allow-duplicates": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const execution = requiredNumber(values.execution, "execution");
  const source = await loadImportSource(values as Record<string, string | boolean | undefined>);
  const rows = parseTaskImportFile(source.buffer, source.filename);
  const fallbackAssignedTo = values["assigned-to"] ?? values.userid ?? "admin";
  const fallbackType = values.type ?? "devel";
  const allowDuplicates = values["allow-duplicates"] ?? false;
  const dryRun = values["dry-run"] ?? false;

  const client = new ZentaoClient({ userid: values.userid });
  let existingTaskNames = new Map<string, ExistingExecutionTask[]>();
  if (!dryRun) {
    await client.login(false);
    if (!allowDuplicates) {
      existingTaskNames = await loadExistingTaskNames(client, execution);
    }
  }

  const created: JsonObject[] = [];
  const skipped: Array<{ rowNumber: number; taskName: string; reason: string; existing_task_ids: number[] }> = [];
  const failures: Array<{ rowNumber: number; taskName: string; error: string }> = [];

  for (const row of rows) {
    const normalizedName = row.name.trim().toLowerCase();
    if (!dryRun && !allowDuplicates) {
      const duplicated = existingTaskNames.get(normalizedName) ?? [];
      if (duplicated.length > 0) {
        skipped.push({
          rowNumber: row.rowNumber,
          taskName: row.name,
          reason: "同一执行下已存在同名任务，已跳过",
          existing_task_ids: duplicated.map((item) => item.id).filter((item): item is number => item !== null),
        });
        continue;
      }
    }

    const payload = buildTaskPayload(execution, row, fallbackAssignedTo, fallbackType);
    if (dryRun) {
      created.push({
        ok: true,
        dry_run: true,
        row_number: row.rowNumber,
        payload,
      });
      continue;
    }

      try {
      const result = await client.createTask(payload);
      const createdTaskId = typeof result.task_id === "number" ? result.task_id : Number(result.task_id);
      created.push({
        row_number: row.rowNumber,
        task_name: row.name,
        result,
      });
      if (!allowDuplicates) {
        existingTaskNames.set(normalizedName, [
          ...(existingTaskNames.get(normalizedName) ?? []),
          {
            id: Number.isFinite(createdTaskId) ? createdTaskId : null,
            name: row.name,
          },
        ]);
      }
    } catch (error) {
      failures.push({
        rowNumber: row.rowNumber,
        taskName: row.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  printJson({
    ok: failures.length === 0,
    source_type: source.sourceType,
    source: source.sourceLabel,
    filename: source.filename,
    execution,
    total_rows: rows.length,
    success_count: created.length,
    skipped_count: skipped.length,
    failed_count: failures.length,
    allow_duplicates: allowDuplicates,
    dry_run: dryRun,
    created,
    skipped,
    failures,
    reply_text: buildReplyText({
      execution,
      filename: source.filename,
      sourceType: source.sourceType,
      successCount: created.length,
      skippedCount: skipped.length,
      failedCount: failures.length,
      totalRows: rows.length,
      skipped: skipped.map((item) => ({
        rowNumber: item.rowNumber,
        taskName: item.taskName,
        reason: item.reason,
      })),
      failures: failures.map((item) => ({
        rowNumber: item.rowNumber,
        error: item.error,
      })),
    }),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

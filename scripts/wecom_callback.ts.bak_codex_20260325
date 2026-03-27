import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { printJson, type JsonObject, type JsonValue } from "./zentao_client";
import {
  extractUserid,
  handleWecomTaskRequest,
  parseJsonInput,
} from "./wecom_task_reply";

interface CallbackPayload extends JsonObject {
  content?: string;
  text?: string;
  msgtype?: string;
  MsgType?: string;
  body?: JsonValue;
}

function getNestedString(record: JsonObject | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function toObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

function extractText(payload: CallbackPayload): string {
  return (
    getNestedString(payload, ["content", "text"]) ??
    getNestedString(toObject(payload.body), ["content", "text"]) ??
    getNestedString(toObject(payload.sender), ["content"]) ??
    ""
  );
}

function isTaskIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "我的任务",
    "任务列表",
    "待办任务",
    "查任务",
    "看任务",
    "my task",
    "my tasks",
    "task list",
  ].some((keyword) => normalized.includes(keyword));
}

function buildHelpText(): string {
  return [
    "已接入禅道助手。",
    "当前已支持：查询我的任务列表。",
    "可发送示例：",
    "1. 我的任务",
    "2. 任务列表",
    "3. 查任务",
  ].join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      data: { type: "string" },
      "data-file": { type: "string" },
      status: { type: "string", default: "all" },
      limit: { type: "string" },
      "page-size": { type: "string" },
      "max-lines": { type: "string", default: "10" },
      "sync-user": { type: "boolean", default: true },
    },
    allowPositionals: false,
  });

  const payload = (values["data-file"]
    ? parseJsonInput(readFileSync(values["data-file"], "utf8"), values["data-file"])
    : values.data
      ? parseJsonInput(values.data, "--data")
      : {}) as CallbackPayload;

  const userid = values.userid ?? extractUserid(payload);
  const text = extractText(payload);

  if (!userid) {
    throw new Error("Cannot determine WeCom userid from callback payload.");
  }

  if (!isTaskIntent(text)) {
    printJson({
      ok: true,
      userid,
      intent: "unknown",
      reply_text: buildHelpText(),
    });
    return;
  }

  const result = await handleWecomTaskRequest({
    userid,
    payload,
    status: values.status,
    limit: values.limit ? Number(values.limit) : undefined,
    pageSize: values["page-size"] ? Number(values["page-size"]) : undefined,
    maxLines: values["max-lines"] ? Number(values["max-lines"]) : 10,
    syncUser: values["sync-user"],
  });

  printJson({
    ...result,
    intent: "my_tasks",
    input_text: text,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

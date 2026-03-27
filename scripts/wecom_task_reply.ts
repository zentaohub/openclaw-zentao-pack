import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type JsonObject, type JsonValue, ZentaoClient, printJson } from "./zentao_client";
import { WecomClient, type WecomDirectoryUser } from "./wecom_client";

interface WecomMessagePayload extends JsonObject {
  userid?: string;
  userId?: string;
  FromUserName?: string;
  fromUser?: string;
  from_user?: string;
  content?: string;
  text?: string;
  body?: JsonValue;
  sender?: JsonValue;
  session?: JsonValue;
}

export function parseJsonInput(raw: string, source: string): WecomMessagePayload {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed as WecomMessagePayload;
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${source}: ${(error as Error).message}`);
  }
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

export function extractUserid(payload: WecomMessagePayload): string | undefined {
  return (
    getNestedString(payload, ["userid", "userId", "FromUserName", "fromUser", "from_user"]) ??
    getNestedString(toObject(payload.sender), ["userid", "userId", "from_user_id", "id"]) ??
    getNestedString(toObject(payload.session), ["userid", "userId", "fromUser"])
  );
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Option --${optionName} must be a positive number`);
  }
  return Math.floor(parsed);
}

function mapWecomUserToSyncPayload(user: WecomDirectoryUser, userid: string): JsonObject {
  return {
    userid,
    userId: userid,
    account: typeof user.userid === "string" && user.userid.trim() ? user.userid.trim() : userid,
    name: typeof user.name === "string" ? user.name.trim() : undefined,
    realname: typeof user.name === "string" ? user.name.trim() : undefined,
    email: typeof user.email === "string" ? user.email.trim() : undefined,
    mobile: typeof user.mobile === "string" ? user.mobile.trim() : undefined,
    telephone: typeof user.telephone === "string" ? user.telephone.trim() : undefined,
    gender:
      typeof user.gender === "string" || typeof user.gender === "number" ? user.gender : undefined,
    department: user.department,
    role: typeof user.position === "string" ? user.position.trim() : undefined,
  };
}

function formatTaskLine(task: JsonObject, index: number): string {
  const id = typeof task.id === "number" ? `#${task.id}` : "#-";
  const name = typeof task.name === "string" && task.name.trim() ? task.name.trim() : "Unnamed task";
  const status =
    typeof task.status === "string" && task.status.trim() ? task.status.trim() : "unknown";
  const deadline =
    typeof task.deadline === "string" && task.deadline.trim() ? ` | deadline ${task.deadline}` : "";
  const left =
    typeof task.left === "number" && Number.isFinite(task.left) ? ` | left ${task.left}h` : "";
  return `${index + 1}. [${status}] ${id} ${name}${deadline}${left}`;
}

function buildReplyText(input: {
  userid: string;
  matchedAccount: string | null;
  count: number;
  statusCounts: Record<string, number>;
  tasks: JsonObject[];
  maxLines: number;
}): string {
  const header = [
    `已识别企微用户：${input.userid}`,
    `禅道账号：${input.matchedAccount ?? "未匹配到"}`,
    `任务总数：${input.count}`,
  ];

  const statusSummary = Object.entries(input.statusCounts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([status, count]) => `${status}:${count}`)
    .join(" | ");

  const lines = input.tasks.slice(0, input.maxLines).map(formatTaskLine);
  if (input.tasks.length === 0) {
    lines.push("当前没有查询到你的任务。");
  } else if (input.tasks.length > input.maxLines) {
    lines.push(`仅展示前 ${input.maxLines} 条，请缩小条件后重试。`);
  }

  return [...header, `状态统计：${statusSummary || "none"}`, "", ...lines].join("\n");
}

function buildStatusCounts(tasks: JsonObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const status = typeof task.status === "string" && task.status.trim() ? task.status : "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function handleWecomTaskRequest(input: {
  userid?: string;
  payload?: WecomMessagePayload;
  status?: string;
  limit?: number;
  pageSize?: number;
  maxLines?: number;
  syncUser?: boolean;
}): Promise<JsonObject> {
  const payload = input.payload ?? {};
  const userid = input.userid ?? extractUserid(payload);
  if (!userid) {
    throw new Error(
      "Cannot determine current WeCom userid. Pass --userid or provide userid in the callback payload.",
    );
  }
  const limit = input.limit;
  const pageSize = input.pageSize;
  const maxLines = input.maxLines ?? 10;

  const wecomClient = new WecomClient();
  let wecomUser: WecomDirectoryUser | null = null;
  let syncResult: JsonObject | null = null;
  let wecomError: string | null = null;

  if ((input.syncUser ?? true) && wecomClient.isConfigured() && wecomClient.autoSyncUser) {
    try {
      wecomUser = await wecomClient.getUser(userid);
    } catch (error) {
      wecomError = error instanceof Error ? error.message : String(error);
    }
  }

  const zentaoClient = new ZentaoClient({ userid });
  await zentaoClient.login(false);

  if (wecomUser) {
    syncResult = await zentaoClient.syncWecomUser(mapWecomUserToSyncPayload(wecomUser, userid));
  }

  const result = await zentaoClient.getMyTasks({
    status: input.status ?? "all",
    limit,
    pageSize,
  });
  const tasks = result.tasks as JsonObject[];
  const statusCounts = buildStatusCounts(tasks);
  const matchedAccount =
    typeof result.matchedUser?.account === "string" ? result.matchedUser.account : null;
  const replyText = buildReplyText({
    userid,
    matchedAccount,
    count: tasks.length,
    statusCounts,
    tasks,
    maxLines,
  });

  return {
    ok: true,
    userid,
    matched_user: result.matchedUser,
    identifiers: result.identifiers,
    sync_result: syncResult,
    wecom_user: wecomUser,
    wecom_error: wecomError,
    count: tasks.length,
    status_counts: statusCounts,
    reply_text: replyText,
    tasks,
  };
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

  const payload = values["data-file"]
    ? parseJsonInput(readFileSync(values["data-file"], "utf8"), values["data-file"])
    : values.data
      ? parseJsonInput(values.data, "--data")
      : {};

  const result = await handleWecomTaskRequest({
    userid: values.userid,
    payload,
    status: values.status,
    limit: optionalNumber(values.limit, "limit"),
    pageSize: optionalNumber(values["page-size"], "page-size"),
    maxLines: optionalNumber(values["max-lines"], "max-lines") ?? 10,
    syncUser: values["sync-user"],
  });

  printJson(result);
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}

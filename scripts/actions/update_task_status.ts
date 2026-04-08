import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from '../shared/zentao_client';
import { notifyTaskStatusChanged } from "../shared/wecom_notify";

const ALLOWED_STATUSES = new Set(["doing", "done", "pause", "closed", "activate"]);

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function requiredNumber(value: string | undefined, optionName: string): number {
  const parsed = Number(requiredString(value, optionName));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Option --${optionName} must be a valid number`);
  }
  return parsed;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Option --${optionName} must be a valid number`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      task: { type: "string" },
      "task-id": { type: "string" },
      userid: { type: "string" },
      status: { type: "string" },
      comment: { type: "string", default: "" },
      "consumed-hours": { type: "string" },
      "left-hours": { type: "string" },
    },
    allowPositionals: false,
  });

  const status = requiredString(values.status, "status");
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`Unsupported status '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).sort().join(", ")}`);
  }

  if (status === "done" && values["consumed-hours"] === undefined) {
    throw new Error("Status 'done' requires --consumed-hours for the current finished effort.");
  }

  const payload: JsonObject = { status };
  if (values.comment) {
    payload.comment = values.comment;
  }
  const consumedHours = optionalNumber(values["consumed-hours"], "consumed-hours");
  if (consumedHours !== undefined) {
    payload.consumedHours = consumedHours;
  }
  const leftHours = optionalNumber(values["left-hours"], "left-hours");
  if (leftHours !== undefined) {
    payload.leftHours = leftHours;
  }

  const taskIdRaw = values.task ?? values["task-id"];
  const taskId = requiredNumber(taskIdRaw, values.task ? "task" : "task-id");

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  let oldStatus: string | undefined;
  try {
    const before = await client.getWebJsonViewData(`/task-view-${taskId}.json`);
    const task = typeof before.task === "object" && before.task !== null && !Array.isArray(before.task)
      ? before.task as JsonObject
      : undefined;
    oldStatus = typeof task?.status === "string" ? task.status : undefined;
  } catch {
    oldStatus = undefined;
  }
  const result = await client.updateTaskStatus(taskId, payload);
  let notification: JsonObject | undefined;
  try {
    notification = await notifyTaskStatusChanged({
      taskId,
      operatorUserid: values.userid,
      oldStatus,
      newStatus: status,
      comment: values.comment,
    });
  } catch (error) {
    notification = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  printJson({
    ok: true,
    action: "update-task-status",
    task: requiredNumber(taskIdRaw, values.task ? "task" : "task-id"),
    status,
    comment: payload.comment ?? "",
    consumed_hours: payload.consumedHours ?? null,
    left_hours: payload.leftHours ?? null,
    message: result.message ?? result.msg ?? "任务状态已更新",
    raw: result,
    notification,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

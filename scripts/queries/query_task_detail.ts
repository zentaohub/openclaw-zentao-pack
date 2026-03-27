import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function summarizeTask(task: JsonObject): JsonObject {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    assignedTo: task.assignedTo,
    project: task.project,
    execution: task.execution,
    story: task.story,
    estimate: task.estimate,
    consumed: task.consumed,
    left: task.left,
    pri: task.pri,
    progress: task.progress,
    openedBy: task.openedBy,
    openedDate: task.openedDate,
    finishedBy: task.finishedBy,
    finishedDate: task.finishedDate,
    closedBy: task.closedBy,
    closedDate: task.closedDate,
    raw: task,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      task: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.task) throw new Error("Missing required option --task");
  const taskId = Number(values.task);
  if (!Number.isFinite(taskId) || taskId <= 0) throw new Error(`Invalid --task value: ${values.task}`);

  const client = new ZentaoClient({ userid: values.userid });
  const viewData = await client.getWebJsonViewData(`/task-view-${taskId}.json`);
  const viewTask = asObject(viewData.task);
  if (!viewTask) throw new Error(`Task payload missing for task ${taskId}`);

  let mergedTask: JsonObject = { ...viewTask };
  const executionId = Number(viewTask.execution ?? 0);
  if (Number.isFinite(executionId) && executionId > 0) {
    try {
      const listData = await client.getWebJsonViewData(`/execution-task-${executionId}.json`);
      const listTasks = typeof listData.tasks === "object" && listData.tasks !== null
        ? Object.values(listData.tasks).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
        : [];
      const listTask = listTasks.find((item) => Number(item.id ?? 0) === taskId);
      if (listTask) mergedTask = { ...listTask, ...mergedTask };
    } catch {
      // fall back to task view only
    }
  }

  printJson({
    ok: true,
    type: "task-detail",
    task: taskId,
    title: viewData.title ?? null,
    detail: {
      ...summarizeTask(mergedTask),
      rawView: viewTask,
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


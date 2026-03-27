import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject, type ZentaoTask } from "./zentao_client";

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

function summarizeTask(task: ZentaoTask): JsonObject {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    assignedTo: task.assignedTo,
    project: task.project,
    execution: task.execution,
    estimate: task.estimate,
    consumed: task.consumed,
    left: task.left,
    deadline: task.deadline,
    pri: task.pri,
    raw: task,
  };
}

function buildStatusCounts(tasks: ZentaoTask[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const status = typeof task.status === "string" && task.status.trim() ? task.status : "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      status: { type: "string", default: "all" },
      limit: { type: "string" },
      "page-size": { type: "string" },
    },
    allowPositionals: false,
  });

  const limit = optionalNumber(values.limit, "limit");
  const pageSize = optionalNumber(values["page-size"], "page-size");

  const client = new ZentaoClient({
    userid: values.userid,
  });
  await client.login(false);

  const result = await client.getMyTasks({
    status: values.status,
    limit,
    pageSize,
  });

  printJson({
    ok: true,
    userid: values.userid ?? client.userid ?? null,
    matched_user: result.matchedUser,
    identifiers: result.identifiers,
    status_filter: values.status,
    limit: limit ?? 50,
    count: result.tasks.length,
    status_counts: buildStatusCounts(result.tasks),
    tasks: result.tasks.map(summarizeTask),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

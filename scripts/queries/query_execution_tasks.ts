import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject, type JsonValue } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractTaskItems(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  return [];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      execution: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.execution) {
    throw new Error("Missing required option --execution");
  }

  const executionId = Number(values.execution);
  if (!Number.isFinite(executionId) || executionId <= 0) {
    throw new Error(`Invalid --execution value: ${values.execution}`);
  }

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/execution-task-${executionId}.json`);
  const items = extractTaskItems(data.tasks);

  printJson({
    ok: true,
    type: "execution-tasks",
    execution: executionId,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "name", "status", "assignedTo", "story", "estimate", "consumed", "left", "pri", "progress"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


import { parseArgs } from "node:util";
import { printJson, type JsonObject, type JsonValue, ZentaoClient } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: JsonValue | undefined): JsonObject[] {
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
    },
    allowPositionals: false,
  });
  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData("/my-work-bug-assignedTo.json");
  const items = extractItems(data.bugs).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: "my-bugs",
    title: data.title ?? null,
    count: items.length,
    todo_count: data.todoCount ?? null,
    items: summarizeList(items, ["id", "title", "status", "severity", "pri", "assignedTo", "openedBy", "resolvedBy", "closedBy"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});


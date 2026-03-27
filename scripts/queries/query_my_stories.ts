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
  const data = await client.getWebJsonViewData('/my-work-story-assignedTo.json');
  const items = extractItems(data.stories).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: "my-stories",
    title: data.title ?? null,
    count: items.length,
    todo_count: data.todoCount ?? null,
    items: summarizeList(items, ["id", "title", "status", "stage", "category", "pri", "estimate", "assignedTo", "openedBy", "reviewedBy"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});


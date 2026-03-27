import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject, type JsonValue } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractExecutionItems(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter(
      (item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item),
    );
  }
  return [];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      project: { type: "string" },
    },
    allowPositionals: false,
  });

  const client = new ZentaoClient({ userid: values.userid });
  const projectId = values.project ? Number(values.project) : null;

  let data: JsonObject;
  let items: JsonObject[];
  let sourceRoute: string;
  let fallbackUsed = false;

  if (projectId) {
    sourceRoute = `/project-execution-${projectId}.json`;
    data = await client.getWebJsonViewData(sourceRoute);
    items = extractExecutionItems(data.executionStats);

    if (items.length === 0) {
      const fallbackRoute = "/execution-all.json";
      const fallbackData = await client.getWebJsonViewData(fallbackRoute);
      const fallbackItems = extractExecutionItems(fallbackData.executionStats).filter(
        (item) => Number(item.project ?? item.parent ?? 0) === projectId,
      );
      if (fallbackItems.length > 0) {
        data = fallbackData;
        items = fallbackItems;
        sourceRoute = fallbackRoute;
        fallbackUsed = true;
      }
    }
  } else {
    sourceRoute = "/execution-all.json";
    data = await client.getWebJsonViewData(sourceRoute);
    items = extractExecutionItems(data.executionStats);
  }

  printJson({
    ok: true,
    type: "executions",
    title: data.title ?? null,
    project: projectId,
    count: items.length,
    source_route: sourceRoute,
    fallback_used: fallbackUsed,
    items: summarizeList(items, ["id", "name", "project", "status", "begin", "end", "PM", "type", "hasProduct"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

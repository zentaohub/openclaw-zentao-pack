import { parseArgs } from "node:util";
import { printJson, ZentaoClient } from "../shared/zentao_client";
import { extractArrayObjects, summarizeList } from "./_query_utils";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      program: { type: "string", default: "all" },
      status: { type: "string", default: "all" },
    },
    allowPositionals: false,
  });

  const route = `/project-browse-${values.program}-${values.status}-0.json`;
  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(route);
  const items = extractArrayObjects(data.projectStats);

  printJson({
    ok: true,
    type: "projects",
    title: data.title ?? null,
    program: values.program,
    status: values.status,
    count: items.length,
    items: summarizeList(items, ["id", "name", "parent", "status", "begin", "end", "PM", "hasProduct", "type"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


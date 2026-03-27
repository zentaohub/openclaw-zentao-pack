import { parseArgs } from "node:util";
import { printJson, ZentaoClient } from "../shared/zentao_client";
import { extractRecordValues, summarizeList } from "./_query_utils";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
    },
    allowPositionals: false,
  });
  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData("/program-browse.json");
  const items = extractRecordValues(data.programs);

  printJson({
    ok: true,
    type: "programs",
    title: data.title ?? null,
    summary: data.summary ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "name", "status", "begin", "end", "PM", "type", "hasProduct"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


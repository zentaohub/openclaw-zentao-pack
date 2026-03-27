import { parseArgs } from "node:util";
import { printJson, ZentaoClient } from "../shared/zentao_client";
import { extractArrayObjects, summarizeList } from "./_query_utils";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
    },
    allowPositionals: false,
  });
  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData("/product-all.json");
  const items = extractArrayObjects(data.productStats);

  printJson({
    ok: true,
    type: "products",
    title: data.title ?? null,
    total: data.recTotal ?? items.length,
    count: items.length,
    items: summarizeList(items, ["id", "name", "program", "status", "PO", "QD", "RD", "type"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


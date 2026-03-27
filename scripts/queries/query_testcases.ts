import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject, type JsonValue } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      product: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.product) {
    throw new Error("Missing required option --product");
  }

  const productId = Number(values.product);
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new Error(`Invalid --product value: ${values.product}`);
  }

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/testcase-browse-${productId}-all.json`);
  const items = extractItems(data.cases);

  printJson({
    ok: true,
    type: "test-cases",
    product: productId,
    title: data.title ?? null,
    summary: data.summary ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "title", "type", "stage", "pri", "status", "module", "story"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject, type JsonValue } from "../shared/zentao_client";
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
      product: { type: "string" },
      type: { type: "string", default: "all" },
    },
    allowPositionals: false,
  });

  if (!values.product) throw new Error("Missing required option --product");
  const productId = Number(values.product);
  if (!Number.isFinite(productId) || productId <= 0) throw new Error(`Invalid --product value: ${values.product}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/release-browse-${productId}-${values.type}.json`);
  const items = extractItems(data.releases).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: "releases",
    product: productId,
    release_type: values.type,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "name", "status", "date", "createdBy", "createdDate", "marker"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


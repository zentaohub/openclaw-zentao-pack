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
      product: { type: "string" },
      execution: { type: "string" },
      assignedTo: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.product) throw new Error("Missing required option --product");
  const productId = Number(values.product);
  if (!Number.isFinite(productId) || productId <= 0) throw new Error(`Invalid --product value: ${values.product}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/bug-browse-${productId}-resolved-0-id_desc-0-100-1.json`);
  const executionId = values.execution ? Number(values.execution) : null;
  if (values.execution && (!Number.isFinite(executionId) || executionId! <= 0)) {
    throw new Error(`Invalid --execution value: ${values.execution}`);
  }

  const items = extractItems(data.bugs)
    .filter((item) => executionId === null || Number(item.execution ?? 0) === executionId)
    .filter((item) => !values.assignedTo || String(item.assignedTo ?? "") === values.assignedTo)
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: "regression-bugs",
    product: productId,
    execution: executionId,
    assignedTo: values.assignedTo ?? null,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "title", "status", "resolution", "severity", "pri", "assignedTo", "resolvedBy", "resolvedDate", "execution", "testtask", "case"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


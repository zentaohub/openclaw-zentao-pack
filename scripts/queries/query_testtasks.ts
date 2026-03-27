import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  return [];
}

function parsePositiveNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${optionName} value: ${value}`);
  }
  return parsed;
}

async function resolveExecutionContext(client: ZentaoClient, executionId: number): Promise<{ productId: number | null; projectId: number | null }> {
  const data = await client.getWebJsonViewData(`/execution-view-${executionId}.json`);
  const execution = typeof data.execution === "object" && data.execution !== null && !Array.isArray(data.execution)
    ? (data.execution as JsonObject)
    : null;
  if (!execution) return { productId: null, projectId: null };

  const productId = Number(execution.productID ?? execution.product ?? 0);
  const projectId = Number(execution.project ?? execution.parent ?? 0);
  return {
    productId: Number.isFinite(productId) && productId > 0 ? productId : null,
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      product: { type: "string" },
      execution: { type: "string" },
      project: { type: "string" },
      type: { type: "string", default: "all" },
    },
    allowPositionals: false,
  });

  const productId = parsePositiveNumber(values.product, "product");
  const executionId = parsePositiveNumber(values.execution, "execution");
  const projectId = parsePositiveNumber(values.project, "project");

  if (productId === undefined && executionId === undefined && projectId === undefined) {
    throw new Error("At least one of --product, --execution, or --project is required");
  }

  const client = new ZentaoClient({ userid: values.userid });

  let resolvedProductId = productId;
  let resolvedProjectId = projectId;
  if (resolvedProductId === undefined && executionId !== undefined) {
    const context = await resolveExecutionContext(client, executionId);
    resolvedProductId = context.productId ?? undefined;
    if (resolvedProjectId === undefined) resolvedProjectId = context.projectId ?? undefined;
  }

  const browseProductId = resolvedProductId ?? 0;
  const data = await client.getWebJsonViewData(`/testtask-browse-${browseProductId}-0-${values.type ?? "all"}-id_desc-0-100-1.json`);
  let items = extractItems(data.tasks).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  if (resolvedProductId !== undefined) items = items.filter((item) => Number(item.product ?? 0) === resolvedProductId);
  if (executionId !== undefined) items = items.filter((item) => Number(item.execution ?? 0) === executionId);
  if (resolvedProjectId !== undefined) items = items.filter((item) => Number(item.project ?? 0) === resolvedProjectId);

  printJson({
    ok: true,
    type: "testtasks",
    product: resolvedProductId ?? null,
    execution: executionId ?? null,
    project: resolvedProjectId ?? null,
    browse_type: values.type ?? "all",
    browse_product: browseProductId,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["id", "name", "status", "owner", "pri", "begin", "end", "build", "buildName", "execution", "project", "product"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

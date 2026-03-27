import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { countByField, loadAcceptanceSnapshot } from "./_acceptance_utils";

function parsePositiveNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${optionName} value: ${value}`);
  }
  return parsed;
}

async function resolveContext(client: ZentaoClient, input: { product?: number; execution?: number; testtask?: number }): Promise<{ productId: number; executionId: number }> {
  if (input.product && input.execution) return { productId: input.product, executionId: input.execution };
  if (input.testtask) {
    const detail = await client.getWebJsonViewData(`/testtask-view-${input.testtask}.json`);
    const task = typeof detail.task === "object" && detail.task !== null && !Array.isArray(detail.task)
      ? (detail.task as JsonObject)
      : (detail as JsonObject);
    const productId = Number(task.product ?? 0);
    const executionId = Number(task.execution ?? 0);
    if (Number.isFinite(productId) && productId > 0 && Number.isFinite(executionId) && executionId > 0) {
      return { productId, executionId };
    }
  }
  if (input.execution) {
    const testtaskBrowse = await client.getWebJsonViewData(`/testtask-browse-0-0-all-id_desc-0-100-1.json`);
    const tasks = typeof testtaskBrowse.tasks === "object" && testtaskBrowse.tasks !== null
      ? Object.values(testtaskBrowse.tasks).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
      : [];
    const matchedTask = tasks.find((item) => Number(item.execution ?? 0) === input.execution && Number(item.product ?? 0) > 0);
    const productId = Number(matchedTask?.product ?? 0);
    if (Number.isFinite(productId) && productId > 0) {
      return { productId, executionId: input.execution };
    }
  }
  throw new Error("Missing required context. Provide --product and --execution, or use --testtask, or use resolvable --execution");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      product: { type: "string" },
      execution: { type: "string" },
      testtask: { type: "string" },
    },
    allowPositionals: false,
  });

  const product = parsePositiveNumber(values.product, "product");
  const execution = parsePositiveNumber(values.execution, "execution");
  const testtask = parsePositiveNumber(values.testtask, "testtask");

  const client = new ZentaoClient({ userid: values.userid });
  const { productId, executionId } = await resolveContext(client, { product, execution, testtask });
  const snapshot = await loadAcceptanceSnapshot(client, productId, executionId);

  printJson({
    ok: true,
    type: "acceptance-overview",
    product: productId,
    execution: executionId,
    resolved_from: {
      product: product ?? null,
      execution: execution ?? null,
      testtask: testtask ?? null,
    },
    product_name: snapshot.productOverview.name ?? null,
    product_status: snapshot.productOverview.status ?? null,
    counts: {
      releases: snapshot.releases.length,
      stories: snapshot.stories.length,
      tasks: snapshot.tasks.length,
      test_cases: snapshot.testCases.length,
      product_bugs: snapshot.productBugs.length,
      my_bugs: snapshot.myBugCount,
    },
    task_status: countByField(snapshot.tasks, "status"),
    story_status: countByField(snapshot.stories, "status"),
    bug_status: countByField(snapshot.productBugs, "status"),
    my_tasks_summary: snapshot.myTasksSummary,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

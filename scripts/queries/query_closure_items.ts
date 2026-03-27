import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { loadAcceptanceSnapshot } from "./_acceptance_utils";
import { summarizeList } from "./_query_utils";

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

  const openTasks = snapshot.tasks.filter((task) => !["done", "closed", "cancel"].includes(String(task.status ?? "")));
  const activeStories = snapshot.stories.filter((story) => !["closed"].includes(String(story.status ?? "")));
  const unresolvedBugs = snapshot.productBugs.filter((bug) => !["resolved", "closed"].includes(String(bug.status ?? "")));
  const releasableRecords = snapshot.releases.filter((release) => !["normal"].includes(String(release.status ?? "")));

  printJson({
    ok: true,
    type: "closure-items",
    product: productId,
    execution: executionId,
    resolved_from: {
      product: product ?? null,
      execution: execution ?? null,
      testtask: testtask ?? null,
    },
    blockers: {
      open_tasks: openTasks.length,
      active_stories: activeStories.length,
      unresolved_bugs: unresolvedBugs.length,
      non_normal_releases: releasableRecords.length,
    },
    items: {
      open_tasks: summarizeList(openTasks as JsonObject[], ["id", "name", "status", "assignedTo", "story", "estimate", "consumed", "left"]),
      active_stories: summarizeList(activeStories as JsonObject[], ["id", "title", "status", "stage", "openedBy", "assignedTo"]),
      unresolved_bugs: summarizeList(unresolvedBugs as JsonObject[], ["id", "title", "status", "resolution", "assignedTo", "story", "testtask", "case"]),
      non_normal_releases: summarizeList(releasableRecords as JsonObject[], ["id", "name", "status", "date", "stories", "bugs"]),
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

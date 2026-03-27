import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { loadAcceptanceSnapshot, normalizeNumber } from "./_acceptance_utils";

function parsePositiveNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${optionName} value: ${value}`);
  }
  return parsed;
}

async function resolveExecutionContext(client: ZentaoClient, input: { execution?: number; testtask?: number; product?: number }): Promise<{ executionId: number; productId: number }> {
  if (input.execution && input.product) {
    return { executionId: input.execution, productId: input.product };
  }

  if (input.testtask) {
    const detailData = await client.getWebJsonViewData(`/testtask-view-${input.testtask}.json`);
    const task = typeof detailData.task === "object" && detailData.task !== null && !Array.isArray(detailData.task)
      ? (detailData.task as JsonObject)
      : (detailData as JsonObject);
    const executionId = Number(task.execution ?? 0);
    const productId = Number(task.product ?? 0);
    if (Number.isFinite(executionId) && executionId > 0 && Number.isFinite(productId) && productId > 0) {
      return { executionId, productId };
    }
  }

  if (input.execution) {
    const executionData = await client.getWebJsonViewData(`/execution-view-${input.execution}.json`);
    const execution = typeof executionData.execution === "object" && executionData.execution !== null && !Array.isArray(executionData.execution)
      ? (executionData.execution as JsonObject)
      : null;
    const productId = Number(execution?.productID ?? execution?.product ?? 0);
    if (Number.isFinite(productId) && productId > 0) {
      return { executionId: input.execution, productId };
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
  const { productId, executionId } = await resolveExecutionContext(client, { product, execution, testtask });

  const snapshot = await loadAcceptanceSnapshot(client, productId, executionId);
  const unresolvedBugs = normalizeNumber(snapshot.productOverview.unresolvedBugs);
  const totalStories = normalizeNumber(snapshot.productOverview.totalStories);
  const releases = normalizeNumber(snapshot.productOverview.releases);
  const tasksDone = snapshot.tasks.filter((task) => task.status === "done" || task.status === "closed").length;

  const checklist = [
    { item: "产品状态正常", passed: snapshot.productOverview.status === "normal", actual: snapshot.productOverview.status ?? null },
    { item: "执行范围内需求已关联", passed: snapshot.stories.length > 0, actual: snapshot.stories.length },
    { item: "执行范围内任务已建立", passed: snapshot.tasks.length > 0, actual: snapshot.tasks.length },
    { item: "测试用例已建立", passed: snapshot.testCases.length > 0, actual: snapshot.testCases.length },
    { item: "未解决 Bug 为 0", passed: unresolvedBugs === 0, actual: unresolvedBugs },
    { item: "发布记录已存在", passed: releases > 0 || snapshot.releases.length > 0, actual: releases || snapshot.releases.length },
    { item: "需求总数大于 0", passed: totalStories > 0, actual: totalStories },
    { item: "已完成任务大于 0", passed: tasksDone > 0, actual: tasksDone },
  ];

  printJson({
    ok: true,
    type: "go-live-checklist",
    product: productId,
    execution: executionId,
    resolved_from: {
      product: product ?? null,
      execution: execution ?? null,
      testtask: testtask ?? null,
    },
    passed_count: checklist.filter((item) => item.passed).length,
    total_count: checklist.length,
    checklist,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

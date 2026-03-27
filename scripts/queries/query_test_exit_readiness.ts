import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function extractItems(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  return [];
}

function countBy<T extends string>(items: JsonObject[], key: string): Record<T, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = typeof item[key] === "string" ? String(item[key]) : "";
    if (!value) continue;
    result[value] = (result[value] ?? 0) + 1;
  }
  return result as Record<T, number>;
}

function parsePositiveNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --${optionName} value: ${value}`);
  return parsed;
}

async function resolveTesttaskId(client: ZentaoClient, input: {
  testtask?: number;
  execution?: number;
  project?: number;
  product?: number;
}): Promise<number> {
  if (input.testtask) return input.testtask;

  if (input.execution || input.project || input.product) {
    const browseProductId = input.product ?? 0;
    const data = await client.getWebJsonViewData(`/testtask-browse-${browseProductId}-0-all-id_desc-0-100-1.json`);
    let items = extractItems(data.tasks).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));
    if (input.product) items = items.filter((item) => Number(item.product ?? 0) === input.product);
    if (input.execution) items = items.filter((item) => Number(item.execution ?? 0) === input.execution);
    if (input.project) items = items.filter((item) => Number(item.project ?? 0) === input.project);
    const latest = items[0];
    const id = Number(latest?.id ?? 0);
    if (Number.isFinite(id) && id > 0) return id;
  }

  throw new Error("Missing required option --testtask, or provide resolvable --execution/--project/--product context");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      testtask: { type: "string" },
      execution: { type: "string" },
      project: { type: "string" },
      product: { type: "string" },
    },
    allowPositionals: false,
  });

  const testtask = parsePositiveNumber(values.testtask, "testtask");
  const execution = parsePositiveNumber(values.execution, "execution");
  const project = parsePositiveNumber(values.project, "project");
  const product = parsePositiveNumber(values.product, "product");

  const client = new ZentaoClient({ userid: values.userid });
  const testtaskId = await resolveTesttaskId(client, { testtask, execution, project, product });

  const detailData = await client.getWebJsonViewData(`/testtask-view-${testtaskId}.json`);
  const testtaskData = typeof detailData.task === "object" && detailData.task !== null && !Array.isArray(detailData.task)
    ? (detailData.task as JsonObject)
    : (detailData as JsonObject);
  const productId = Number(testtaskData.product ?? 0);
  if (!Number.isFinite(productId) || productId <= 0) throw new Error(`Testtask ${testtaskId} missing product id`);

  const casesData = await client.getWebJsonViewData(`/testtask-cases-${testtaskId}-all-0-id_desc-0-100-1.json`);
  const caseRuns = extractItems(casesData.runs);
  const bugData = await client.getWebJsonViewData(`/bug-browse-${productId}-all-0-id_desc-0-100-1.json`);
  const allBugs = extractItems(bugData.bugs);
  const relatedBugs = allBugs.filter((bug) => Number(bug.testtask ?? 0) === testtaskId);

  const caseResultCounts = countBy(caseRuns, "lastRunResult");
  const bugStatusCounts = countBy(relatedBugs, "status");
  const totalCases = caseRuns.length;
  const referencedBugHints = caseRuns.reduce((sum, item) => sum + Number(item.bugs ?? 0), 0);
  const passedCases = caseRuns.filter((item) => item.lastRunResult === "pass").length;
  const failedCases = caseRuns.filter((item) => item.lastRunResult === "fail").length;
  const blockedCases = caseRuns.filter((item) => item.lastRunResult === "blocked").length;
  const unrunCases = caseRuns.filter((item) => !item.lastRunResult).length;
  const activeBugs = relatedBugs.filter((item) => item.status === "active").length;
  const unresolvedBugs = relatedBugs.filter((item) => item.status !== "closed").length;

  const blockers: string[] = [];
  if (String(testtaskData.status ?? "") !== "done") blockers.push("testtask_not_done");
  if (totalCases === 0) blockers.push("no_linked_cases");
  if (unrunCases > 0) blockers.push(`unrun_cases=${unrunCases}`);
  if (failedCases > 0) blockers.push(`failed_cases=${failedCases}`);
  if (blockedCases > 0) blockers.push(`blocked_cases=${blockedCases}`);
  if (activeBugs > 0) blockers.push(`active_bugs=${activeBugs}`);
  if (unresolvedBugs > 0) blockers.push(`unresolved_bugs=${unresolvedBugs}`);
  if (relatedBugs.length === 0 && referencedBugHints > 0) blockers.push(`case_bug_refs=${referencedBugHints}`);

  printJson({
    ok: true,
    type: "test-exit-readiness",
    testtask: testtaskId,
    resolved_from: {
      testtask: testtask ?? null,
      execution: execution ?? null,
      project: project ?? null,
      product: product ?? null,
    },
    ready_for_exit: blockers.length === 0,
    blockers,
    summary: {
      status: testtaskData.status ?? null,
      realBegan: testtaskData.realBegan ?? null,
      realFinishedDate: testtaskData.realFinishedDate ?? null,
      totalCases,
      passedCases,
      failedCases,
      blockedCases,
      unrunCases,
      relatedBugCount: relatedBugs.length,
      activeBugs,
      unresolvedBugs,
      caseResultCounts,
      bugStatusCounts,
      referencedBugHints,
    },
    testtask_detail: {
      id: testtaskData.id,
      name: testtaskData.name,
      product: testtaskData.product,
      project: testtaskData.project,
      execution: testtaskData.execution,
      build: testtaskData.build,
      buildName: testtaskData.buildName,
    },
    case_runs: caseRuns,
    related_bugs: relatedBugs,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

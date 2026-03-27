import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function asObject(value: unknown): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as JsonObject;
  throw new Error('Testtask detail payload is not a JSON object');
}

function extractTaskFromBrowse(value: unknown, testtaskId: number): JsonObject | null {
  if (Array.isArray(value)) {
    return (value.find((item) => typeof item === 'object' && item !== null && !Array.isArray(item) && Number((item as JsonObject).id ?? 0) === testtaskId) as JsonObject | undefined) ?? null;
  }
  if (typeof value === 'object' && value !== null) {
    const items = Object.values(value).filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item));
    return items.find((item) => Number(item.id ?? 0) === testtaskId) ?? null;
  }
  return null;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      testtask: { type: 'string' },
    },
    allowPositionals: false,
  });

  if (!values.testtask) throw new Error('Missing required option --testtask');
  const testtaskId = Number(values.testtask);
  if (!Number.isFinite(testtaskId) || testtaskId <= 0) throw new Error(`Invalid --testtask value: ${values.testtask}`);

  const client = new ZentaoClient({ userid: values.userid });
  const viewData = await client.getWebJsonViewData(`/testtask-view-${testtaskId}.json`);
  const viewTask = asObject(viewData.task ?? viewData);
  const productId = Number(viewTask.product ?? 0);
  const browseData = productId > 0 ? await client.getWebJsonViewData(`/testtask-browse-${productId}-0-all-id_desc-0-100-1.json`) : { tasks: [] };
  const browseTask = extractTaskFromBrowse((browseData as JsonObject).tasks, testtaskId);
  const task = { ...viewTask, ...(browseTask ?? {}) };

  printJson({
    ok: true,
    type: 'testtask-detail',
    testtask: testtaskId,
    title: viewData.title ?? browseData.title ?? null,
    detail: {
      id: task.id,
      name: task.name,
      status: task.status,
      product: task.product,
      project: task.project,
      execution: task.execution,
      build: task.build,
      buildName: task.buildName,
      owner: task.owner,
      pri: task.pri,
      begin: task.begin,
      end: task.end,
      realBegan: task.realBegan,
      realFinishedDate: task.realFinishedDate,
      type: task.type,
      createdBy: task.createdBy,
      createdDate: task.createdDate,
      desc: task.desc,
      raw: task,
      rawView: viewTask,
      rawBrowse: browseTask,
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


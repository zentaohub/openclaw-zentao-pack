import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function asObject(value: unknown): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as JsonObject;
  throw new Error('Bug detail payload is not a JSON object');
}

function extractBugFromBrowse(value: unknown, bugId: number): JsonObject | null {
  if (Array.isArray(value)) {
    return (value.find((item) => typeof item === 'object' && item !== null && !Array.isArray(item) && Number((item as JsonObject).id ?? 0) === bugId) as JsonObject | undefined) ?? null;
  }
  if (typeof value === 'object' && value !== null) {
    const items = Object.values(value).filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item));
    return items.find((item) => Number(item.id ?? 0) === bugId) ?? null;
  }
  return null;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      bug: { type: 'string' },
    },
    allowPositionals: false,
  });

  if (!values.bug) throw new Error('Missing required option --bug');
  const bugId = Number(values.bug);
  if (!Number.isFinite(bugId) || bugId <= 0) throw new Error(`Invalid --bug value: ${values.bug}`);

  const client = new ZentaoClient({ userid: values.userid });
  const viewData = await client.getWebJsonViewData(`/bug-view-${bugId}.json`);
  const viewBug = asObject(viewData.bug ?? viewData);
  const productId = Number(viewBug.product ?? 0);
  const browseData = productId > 0 ? await client.getWebJsonViewData(`/bug-browse-${productId}-all-0-id_desc-0-100-1.json`) : { bugs: [] };
  const browseBug = extractBugFromBrowse((browseData as JsonObject).bugs, bugId);
  const bug = { ...viewBug, ...(browseBug ?? {}) };

  printJson({
    ok: true,
    type: 'bug-detail',
    bug: bugId,
    title: viewData.title ?? browseData.title ?? null,
    detail: {
      id: bug.id,
      title: bug.title,
      status: bug.status,
      resolution: bug.resolution,
      severity: bug.severity,
      pri: bug.pri,
      product: bug.product,
      project: bug.project,
      execution: bug.execution,
      module: bug.module,
      story: bug.story,
      task: bug.task,
      case: bug.case,
      testtask: bug.testtask,
      openedBuild: bug.openedBuild,
      assignedTo: bug.assignedTo,
      resolvedBy: bug.resolvedBy,
      closedBy: bug.closedBy,
      openedBy: bug.openedBy,
      openedDate: bug.openedDate,
      lastEditedDate: bug.lastEditedDate,
      steps: bug.steps,
      raw: bug,
      rawView: viewBug,
      rawBrowse: browseBug,
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


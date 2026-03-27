import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item));
  }
  return [];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      testtask: { type: 'string' },
      type: { type: 'string', default: 'all' },
    },
    allowPositionals: false,
  });

  if (!values.testtask) throw new Error('Missing required option --testtask');
  const testtaskId = Number(values.testtask);
  if (!Number.isFinite(testtaskId) || testtaskId <= 0) throw new Error(`Invalid --testtask value: ${values.testtask}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/testtask-cases-${testtaskId}-${values.type ?? 'all'}-0-id_desc-0-100-1.json`);
  const items = extractItems(data.runs).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: 'testtask-cases',
    testtask: testtaskId,
    browse_type: values.type ?? 'all',
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ['id', 'case', 'title', 'storyTitle', 'assignedTo', 'status', 'lastRunResult', 'lastRunner', 'lastRunDate', 'caseVersion']),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});


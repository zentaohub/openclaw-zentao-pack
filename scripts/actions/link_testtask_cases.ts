import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function parseCaseIds(value: string | undefined): number[] {
  if (!value) throw new Error('Missing required option --cases');
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parsed = Number(item);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid case id: ${item}`);
      return parsed;
    });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      testtask: { type: 'string' },
      cases: { type: 'string' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const testtaskId = requiredNumber(values.testtask, 'testtask');
  const payload: JsonObject = { caseIds: parseCaseIds(values.cases) };

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.linkTesttaskCases(testtaskId, payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('||').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      testtask: { type: 'string' },
      status: { type: 'string' },
      comment: { type: 'string', default: '' },
      'real-began': { type: 'string' },
      'real-finished-date': { type: 'string' },
      mailto: { type: 'string' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const testtaskId = requiredNumber(values.testtask, 'testtask');
  const payload: JsonObject = {
    status: requiredString(values.status, 'status'),
    comment: values.comment ?? '',
  };
  if (values['real-began'] !== undefined) payload.realBegan = values['real-began'];
  if (values['real-finished-date'] !== undefined) payload.realFinishedDate = values['real-finished-date'];
  const mailto = parseList(values.mailto);
  if (mailto.length > 0) payload.mailto = mailto;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.updateTesttaskStatus(testtaskId, payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

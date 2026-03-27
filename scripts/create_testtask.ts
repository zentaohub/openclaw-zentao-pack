import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Option --${optionName} must be a valid number`);
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

function parseBuildIds(build: string | undefined, builds: string | undefined): number[] {
  const raw = builds ?? build;
  if (!raw) throw new Error('Missing required option --build or --builds');
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parsed = Number(item);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid build id: ${item}`);
      return parsed;
    });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      execution: { type: 'string' },
      build: { type: 'string' },
      builds: { type: 'string' },
      name: { type: 'string' },
      begin: { type: 'string' },
      end: { type: 'string' },
      type: { type: 'string', default: 'feature' },
      owner: { type: 'string' },
      pri: { type: 'string' },
      desc: { type: 'string', default: '' },
      members: { type: 'string' },
      mailto: { type: 'string' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    product: requiredNumber(values.product, 'product'),
    builds: parseBuildIds(values.build, values.builds),
    name: requiredString(values.name, 'name'),
    begin: requiredString(values.begin, 'begin'),
    end: requiredString(values.end, 'end'),
    types: parseList(values.type),
    owner: values.owner ?? 'admin',
    desc: values.desc ?? '',
  };

  const execution = optionalNumber(values.execution, 'execution');
  if (execution !== undefined) payload.execution = execution;
  const pri = optionalNumber(values.pri, 'pri');
  if (pri !== undefined) payload.pri = pri;
  const members = parseList(values.members);
  if (members.length > 0) payload.members = members;
  const mailto = parseList(values.mailto);
  if (mailto.length > 0) payload.mailto = mailto;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createTesttask(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      run: { type: 'string' },
      result: { type: 'string', default: 'pass' },
      real: { type: 'string', default: '' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const runId = requiredNumber(values.run, 'run');
  const payload: JsonObject = {
    result: values.result ?? 'pass',
    real: values.real ?? '',
  };

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.runTesttaskCase(runId, payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

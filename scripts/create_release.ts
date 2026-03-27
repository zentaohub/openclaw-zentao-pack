import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function requiredNumber(value: string | undefined, optionName: string): number {
  const parsed = Number(requiredString(value, optionName));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      name: { type: "string" },
      date: { type: "string" },
      desc: { type: "string", default: "" },
      status: { type: "string", default: "normal" },
      marker: { type: "boolean", default: false },
      sync: { type: "boolean", default: true },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    product: requiredNumber(values.product, "product"),
    name: requiredString(values.name, "name"),
    date: requiredString(values.date, "date"),
    desc: values.desc ?? "",
    status: values.status,
    marker: values.marker ? 1 : 0,
    sync: values.sync ? 1 : 0,
  };

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createRelease(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

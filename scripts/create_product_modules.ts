import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function normalizeList(value: string | undefined, optionName: string): string[] {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) throw new Error(`Option --${optionName} must include at least one item`);
  return items;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      modules: { type: "string" },
      shorts: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    modules: normalizeList(values.modules, "modules"),
  };
  if (values.shorts) payload.shorts = normalizeList(values.shorts, "shorts");

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createProductModules(requiredNumber(values.product, "product"), payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

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

function parseSteps(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('||').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      branch: { type: "string" },
      module: { type: "string" },
      story: { type: "string" },
      title: { type: "string" },
      type: { type: "string", default: "feature" },
      pri: { type: "string" },
      precondition: { type: "string", default: "" },
      steps: { type: "string" },
      expects: { type: "string" },
      keywords: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const steps = parseSteps(values.steps);
  const expects = parseSteps(values.expects);
  if (steps.length === 0) throw new Error("Option --steps is required. Use || to separate multiple steps.");

  const payload: JsonObject = {
    product: requiredNumber(values.product, "product"),
    title: requiredString(values.title, "title"),
    type: values.type ?? "feature",
    precondition: values.precondition ?? "",
    steps,
    expects,
  };

  const branch = values.branch ?? "0";
  payload.branch = branch;
  const module = optionalNumber(values.module, "module");
  if (module !== undefined) payload.module = module;
  const story = optionalNumber(values.story, "story");
  if (story !== undefined) payload.story = story;
  const pri = optionalNumber(values.pri, "pri");
  if (pri !== undefined) payload.pri = pri;
  if (values.keywords !== undefined) payload.keywords = values.keywords;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createTestcase(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});


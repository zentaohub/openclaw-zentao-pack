import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function requiredNumber(value: string | undefined, optionName: string): number {
  const parsed = Number(requiredString(value, optionName));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Option --${optionName} must be a valid number`);
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      title: { type: "string" },
      spec: { type: "string" },
      verify: { type: "string" },
      reviewer: { type: "string" },
      "assigned-to": { type: "string" },
      category: { type: "string", default: "SR" },
      module: { type: "string" },
      pri: { type: "string" },
      estimate: { type: "string" },
      keywords: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    product: requiredNumber(values.product, "product"),
    title: requiredString(values.title, "title"),
    spec: requiredString(values.spec, "spec"),
    verify: requiredString(values.verify, "verify"),
    reviewer: requiredString(values.reviewer, "reviewer"),
    category: values.category,
  };
  if (values["assigned-to"]) payload.assignedTo = values["assigned-to"];
  const moduleId = optionalNumber(values.module, "module");
  if (moduleId !== undefined) payload.module = moduleId;
  const pri = optionalNumber(values.pri, "pri");
  if (pri !== undefined) payload.pri = pri;
  const estimate = optionalNumber(values.estimate, "estimate");
  if (estimate !== undefined) payload.estimate = estimate;
  if (values.keywords) payload.keywords = values.keywords;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createStory(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

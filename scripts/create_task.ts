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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      execution: { type: "string" },
      story: { type: "string" },
      module: { type: "string" },
      name: { type: "string" },
      type: { type: "string", default: "devel" },
      "assigned-to": { type: "string" },
      pri: { type: "string" },
      estimate: { type: "string" },
      desc: { type: "string", default: "" },
      keywords: { type: "string" },
      "est-started": { type: "string" },
      deadline: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    execution: requiredNumber(values.execution, "execution"),
    name: requiredString(values.name, "name"),
    type: values.type ?? "devel",
    assignedTo: values["assigned-to"] ?? "admin",
    desc: values.desc ?? "",
  };

  const story = optionalNumber(values.story, "story");
  if (story !== undefined) payload.story = story;
  const module = optionalNumber(values.module, "module");
  if (module !== undefined) payload.module = module;
  const pri = optionalNumber(values.pri, "pri");
  if (pri !== undefined) payload.pri = pri;
  const estimate = optionalNumber(values.estimate, "estimate");
  if (estimate !== undefined) payload.estimate = estimate;
  if (values.keywords !== undefined) payload.keywords = values.keywords;
  if (values["est-started"] !== undefined) payload.estStarted = values["est-started"];
  if (values.deadline !== undefined) payload.deadline = values.deadline;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createTask(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

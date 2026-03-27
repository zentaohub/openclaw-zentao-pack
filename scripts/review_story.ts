import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

const ALLOWED_RESULTS = new Set(["pass", "clarify", "reject"]);

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
      story: { type: "string" },
      result: { type: "string" },
      comment: { type: "string", default: "" },
      "assigned-to": { type: "string" },
      pri: { type: "string" },
      estimate: { type: "string" },
      "closed-reason": { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const result = requiredString(values.result, "result");
  if (!ALLOWED_RESULTS.has(result)) {
    throw new Error(`Unsupported result '${result}'. Allowed values: ${Array.from(ALLOWED_RESULTS).sort().join(", ")}`);
  }
  if (result === "reject" && !values["closed-reason"]) {
    throw new Error("Result 'reject' requires --closed-reason.");
  }

  const payload: JsonObject = { result };
  if (values.comment) payload.comment = values.comment;
  if (values["assigned-to"]) payload.assignedTo = values["assigned-to"];
  const pri = optionalNumber(values.pri, "pri");
  if (pri !== undefined) payload.pri = pri;
  const estimate = optionalNumber(values.estimate, "estimate");
  if (estimate !== undefined) payload.estimate = estimate;
  if (values["closed-reason"]) payload.closedReason = values["closed-reason"];

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const response = await client.reviewStory(requiredNumber(values.story, "story"), payload);
  printJson(response);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

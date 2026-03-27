import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

const ALLOWED_STATUSES = new Set(["close", "activate"]);

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
      story: { type: "string" },
      status: { type: "string" },
      comment: { type: "string", default: "" },
      "assigned-to": { type: "string" },
      "closed-reason": { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const status = requiredString(values.status, "status");
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`Unsupported status '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).sort().join(", ")}`);
  }
  if (status === "close" && !values["closed-reason"]) {
    throw new Error("Status 'close' requires --closed-reason.");
  }

  const payload: JsonObject = { status };
  if (values.comment) payload.comment = values.comment;
  if (values["assigned-to"]) payload.assignedTo = values["assigned-to"];
  if (values["closed-reason"]) payload.closedReason = values["closed-reason"];

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.updateStoryStatus(requiredNumber(values.story, "story"), payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
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
      scope: { type: "string" },
      root: { type: "string" },
      account: { type: "string" },
      role: { type: "string" },
      days: { type: "string" },
      hours: { type: "string" },
      limited: { type: "string", default: "no" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const scope = requiredString(values.scope, "scope");
  if (scope !== "project" && scope !== "execution") {
    throw new Error("Option --scope must be 'project' or 'execution'");
  }

  const root = Number(requiredString(values.root, "root"));
  if (!Number.isFinite(root) || root <= 0) throw new Error(`Option --root must be a valid positive number`);

  const payload: JsonObject = {
    scope,
    root,
    account: requiredString(values.account, "account"),
    limited: values.limited ?? "no",
  };

  if (values.role !== undefined) payload.role = values.role;
  const days = optionalNumber(values.days, "days");
  if (days !== undefined) payload.days = days;
  const hours = optionalNumber(values.hours, "hours");
  if (hours !== undefined) payload.hours = hours;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.addTeamMember(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

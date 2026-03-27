import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: unknown): JsonObject[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
      userid: { type: "string" }, execution: { type: "string" } }, allowPositionals: false });
  if (!values.execution) throw new Error("Missing required option --execution");
  const executionId = Number(values.execution);
  if (!Number.isFinite(executionId) || executionId <= 0) throw new Error(`Invalid --execution value: ${values.execution}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/execution-view-${executionId}.json`);
  const items = extractItems(data.teamMembers).sort((left, right) => String(left.account ?? "").localeCompare(String(right.account ?? "")));

  printJson({
    ok: true,
    type: "execution-team",
    execution: executionId,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["account", "realname", "role", "days", "hours", "limited", "join"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


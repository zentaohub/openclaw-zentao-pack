import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: unknown): JsonObject[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
      userid: { type: "string" }, project: { type: "string" } }, allowPositionals: false });
  if (!values.project) throw new Error("Missing required option --project");
  const projectId = Number(values.project);
  if (!Number.isFinite(projectId) || projectId <= 0) throw new Error(`Invalid --project value: ${values.project}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/project-view-${projectId}.json`);
  const items = extractItems(data.teamMembers).sort((left, right) => String(left.account ?? "").localeCompare(String(right.account ?? "")));

  printJson({
    ok: true,
    type: "project-team",
    project: projectId,
    title: data.title ?? null,
    count: items.length,
    items: summarizeList(items, ["account", "realname", "role", "days", "hours", "limited", "join"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


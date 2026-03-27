import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredExecution(value: string | undefined): number {
  if (!value) throw new Error("Missing required option --execution");
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --execution value: ${value}`);
  return parsed;
}

function parseIdList(value: string | undefined): number[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
  return Array.from(new Set(ids));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      execution: { type: "string" },
      "story-ids": { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const executionId = requiredExecution(values.execution);
  const storyIds = parseIdList(values["story-ids"]);
  if (storyIds.length === 0) {
    throw new Error("Option --story-ids is required");
  }

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const linkage = await client.linkExecutionStories(executionId, { storyIds });
  const detail = await client.getWebJsonViewData(`/execution-story-${executionId}.json`);

  const result: JsonObject = {
    ok: true,
    execution: executionId,
    linkage,
    detail: {
      title: detail.title ?? null,
      summary: detail.summary ?? null,
      stories: detail.stories ?? [],
    },
  };

  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredRelease(value: string | undefined): number {
  if (!value) throw new Error("Missing required option --release");
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --release value: ${value}`);
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
      release: { type: "string" },
      "story-ids": { type: "string" },
      "bug-ids": { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const releaseId = requiredRelease(values.release);
  const storyIds = parseIdList(values["story-ids"]);
  const bugIds = parseIdList(values["bug-ids"]);
  if (storyIds.length === 0 && bugIds.length === 0) {
    throw new Error("At least one of --story-ids or --bug-ids is required");
  }

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);

  const result: JsonObject = {
    ok: true,
    release: releaseId,
  };

  if (storyIds.length > 0) {
    result.story_linkage = await client.linkReleaseStories(releaseId, { storyIds });
  }

  if (bugIds.length > 0) {
    result.bug_linkage = await client.linkReleaseBugs(releaseId, { bugIds });
  }

  const detail = await client.getWebJsonViewData(`/release-view-${releaseId}.json`);
  result.detail = {
    stories: detail.stories ?? [],
    bugs: detail.bugs ?? [],
    leftBugs: detail.leftBugs ?? [],
    release: detail.release ?? detail,
  };

  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

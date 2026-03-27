import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function asObject(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as JsonObject;
  throw new Error("Release detail payload is not a JSON object");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      release: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.release) throw new Error("Missing required option --release");
  const releaseId = Number(values.release);
  if (!Number.isFinite(releaseId) || releaseId <= 0) throw new Error(`Invalid --release value: ${values.release}`);

  const client = new ZentaoClient({ userid: values.userid });
  const baseData = await client.getWebJsonViewData(`/release-view-${releaseId}.json`);
  const storyData = await client.getWebJsonViewData(`/release-view-${releaseId}-story.json`);
  const bugData = await client.getWebJsonViewData(`/release-view-${releaseId}-bug.json`);
  const leftBugData = await client.getWebJsonViewData(`/release-view-${releaseId}-leftBug.json`);
  const release = asObject(baseData.release ?? storyData.release ?? bugData.release ?? leftBugData.release ?? baseData);

  printJson({
    ok: true,
    type: "release-detail",
    release: releaseId,
    title: typeof baseData.title === "string" ? baseData.title : `RELEASE#${releaseId}`,
    detail: {
      id: release.id,
      name: release.name,
      status: release.status,
      date: release.date,
      releasedDate: release.releasedDate,
      marker: release.marker,
      product: release.product,
      build: release.build,
      stories: storyData.stories ?? baseData.stories ?? [],
      bugs: bugData.bugs ?? baseData.bugs ?? [],
      leftBugs: leftBugData.leftBugs ?? baseData.leftBugs ?? [],
      summary: baseData.summary ?? storyData.summary ?? null,
      desc: release.desc,
      createdBy: release.createdBy,
      createdDate: release.createdDate,
      raw: release,
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


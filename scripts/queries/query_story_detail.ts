import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function asObject(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }
  throw new Error("Story detail payload is not a JSON object");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      story: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.story) throw new Error("Missing required option --story");
  const storyId = Number(values.story);
  if (!Number.isFinite(storyId) || storyId <= 0) throw new Error(`Invalid --story value: ${values.story}`);

  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData(`/story-view-${storyId}.json`);
  const story = asObject(data.story ?? data);
  const title = typeof story.title === "string" ? story.title : null;

  printJson({
    ok: true,
    type: "story-detail",
    story: storyId,
    title: title ? `STORY#${storyId} ${title}` : `STORY#${storyId}`,
    detail: {
      id: story.id,
      title: story.title,
      status: story.status,
      stage: story.stage,
      category: story.category,
      pri: story.pri,
      estimate: story.estimate,
      product: story.product,
      module: story.module,
      assignedTo: story.assignedTo,
      openedBy: story.openedBy,
      reviewedBy: story.reviewedBy,
      reviewer: story.reviewer,
      openedDate: story.openedDate,
      spec: story.spec,
      verify: story.verify,
      raw: story,
    },
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});


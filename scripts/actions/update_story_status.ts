import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { notifyStoryStatusChanged } from "../shared/wecom_notify";

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
  const storyId = requiredNumber(values.story, "story");

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  let oldStatus: string | undefined;
  try {
    const before = await client.getWebJsonViewData(`/story-view-${storyId}.json`);
    const story = typeof before.story === "object" && before.story !== null && !Array.isArray(before.story)
      ? before.story as JsonObject
      : before;
    oldStatus = typeof story.status === "string" ? story.status : undefined;
  } catch {
    oldStatus = undefined;
  }
  const result = await client.updateStoryStatus(storyId, payload);
  let notification: JsonObject | undefined;
  try {
    notification = await notifyStoryStatusChanged({
      storyId,
      operatorUserid: values.userid,
      oldStatus,
      newStatus: status,
      comment: values.comment,
      newAssignee: values["assigned-to"],
      closedReason: values["closed-reason"],
    });
  } catch (error) {
    notification = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  printJson({
    ...result,
    notification,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

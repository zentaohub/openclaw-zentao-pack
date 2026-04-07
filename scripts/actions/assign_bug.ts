import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { notifyBugAssigned } from "../shared/wecom_notify";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('||').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      bug: { type: 'string' },
      'assigned-to': { type: 'string' },
      comment: { type: 'string', default: '' },
      mailto: { type: 'string' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const bugId = requiredNumber(values.bug, 'bug');
  const payload: JsonObject = {
    assignedTo: requiredString(values['assigned-to'], 'assigned-to'),
    comment: values.comment ?? '',
  };
  const mailto = parseList(values.mailto);
  if (mailto.length > 0) payload.mailto = mailto;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  let oldAssignee: string | undefined;
  try {
    const before = await client.getWebJsonViewData(`/bug-view-${bugId}.json`);
    const bug = typeof before.bug === "object" && before.bug !== null && !Array.isArray(before.bug)
      ? before.bug as JsonObject
      : before;
    oldAssignee = typeof bug.assignedTo === "string" ? bug.assignedTo : undefined;
  } catch {
    oldAssignee = undefined;
  }
  const result = await client.assignBug(bugId, payload);
  let notification: JsonObject | undefined;
  try {
    notification = await notifyBugAssigned({
      bugId,
      operatorUserid: values.userid,
      oldAssignee,
      newAssignee: payload.assignedTo as string,
      comment: values.comment,
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
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});

import { type JsonObject, type JsonValue, ZentaoClient } from "./zentao_client";
import {
  notifyBugAssigned,
  notifyBugStatusChanged,
  notifyStoryAssigned,
  notifyStoryStatusChanged,
  notifyTaskAssigned,
  notifyTaskStatusChanged,
} from "./wecom_notify";

type SupportedObjectType = "task" | "bug" | "story";

export interface EntitySnapshot {
  status?: string;
  assignedTo?: string;
}

interface NotifyDetectedChangesInput {
  objectType: SupportedObjectType;
  objectId: number;
  before: EntitySnapshot | null;
  operatorUserid?: string;
  comment?: string;
  closedReason?: string;
}

export async function fetchEntitySnapshot(
  client: ZentaoClient,
  objectType: SupportedObjectType,
  objectId: number,
): Promise<EntitySnapshot | null> {
  try {
    const viewData = await client.getWebJsonViewData(`/${objectType}-view-${objectId}.json`);
    const entity = extractEntity(viewData, objectType);
    if (!entity) return null;
    return {
      status: getString(entity, "status"),
      assignedTo: getString(entity, "assignedTo"),
    };
  } catch {
    return null;
  }
}

export async function notifyDetectedEntityChanges(
  client: ZentaoClient,
  input: NotifyDetectedChangesInput,
): Promise<JsonObject[]> {
  const after = await fetchEntitySnapshot(client, input.objectType, input.objectId);
  if (!after || !input.before) return [];

  const notifications: JsonObject[] = [];
  if (input.before.status !== after.status) {
    notifications.push(await notifyStatusChange(input, after));
  }
  if (input.before.assignedTo !== after.assignedTo && after.assignedTo) {
    notifications.push(await notifyAssigneeChange(input, after.assignedTo));
  }
  return notifications;
}

export function summarizeNotifications(notifications: JsonObject[]): JsonObject | null {
  if (notifications.length === 0) return null;
  if (notifications.length === 1) return notifications[0];

  return {
    ok: notifications.every((item) => item.ok !== false),
    count: notifications.length,
    events: notifications.map((item) => ({
      object_type: item.object_type,
      event_type: item.event_type,
      rule_code: item.rule_code,
      skipped_reason: item.skipped_reason,
      sent_to: item.sent_to,
    })),
  };
}

async function notifyStatusChange(input: NotifyDetectedChangesInput, after: EntitySnapshot): Promise<JsonObject> {
  const before = input.before;
  if (!before) {
    return {
      ok: true,
      enabled: false,
      object_type: input.objectType,
      event_type: "status_changed",
      skipped_reason: "before snapshot is empty",
    };
  }
  if (!after.status) {
    return {
      ok: true,
      enabled: false,
      object_type: input.objectType,
      event_type: "status_changed",
      skipped_reason: "current status is empty after mutation",
    };
  }

  if (input.objectType === "task") {
    return notifyTaskStatusChanged({
      taskId: input.objectId,
      operatorUserid: input.operatorUserid,
      oldStatus: before.status,
      newStatus: after.status,
      comment: input.comment,
    });
  }
  if (input.objectType === "bug") {
    return notifyBugStatusChanged({
      bugId: input.objectId,
      operatorUserid: input.operatorUserid,
      oldStatus: before.status,
      newStatus: after.status,
      comment: input.comment,
    });
  }
  return notifyStoryStatusChanged({
    storyId: input.objectId,
    operatorUserid: input.operatorUserid,
    oldStatus: before.status,
    newStatus: after.status,
    comment: input.comment,
    closedReason: input.closedReason,
  });
}

async function notifyAssigneeChange(input: NotifyDetectedChangesInput, newAssignee: string): Promise<JsonObject> {
  const before = input.before;
  if (!before) {
    return {
      ok: true,
      enabled: false,
      object_type: input.objectType,
      event_type: "assignee_changed",
      skipped_reason: "before snapshot is empty",
    };
  }
  if (input.objectType === "task") {
    return notifyTaskAssigned({
      taskId: input.objectId,
      operatorUserid: input.operatorUserid,
      oldAssignee: before.assignedTo,
      newAssignee,
      comment: input.comment,
    });
  }
  if (input.objectType === "bug") {
    return notifyBugAssigned({
      bugId: input.objectId,
      operatorUserid: input.operatorUserid,
      oldAssignee: before.assignedTo,
      newAssignee,
      comment: input.comment,
    });
  }
  return notifyStoryAssigned({
    storyId: input.objectId,
    operatorUserid: input.operatorUserid,
    oldAssignee: before.assignedTo,
    newAssignee,
    comment: input.comment,
  });
}

function extractEntity(viewData: JsonObject, objectType: SupportedObjectType): JsonObject | null {
  const direct = asObject(viewData[objectType]);
  if (direct) return direct;
  return asObject(viewData);
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}

function getString(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

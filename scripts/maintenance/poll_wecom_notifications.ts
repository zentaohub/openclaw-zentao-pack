import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  loadConfig,
  printJson,
  type JsonObject,
  type JsonValue,
  ZentaoClient,
} from "../shared/zentao_client";
import {
  notifyBugAssigned,
  notifyBugStatusChanged,
  notifyStoryAssigned,
  notifyStoryStatusChanged,
  notifyTaskAssigned,
  notifyTaskStatusChanged,
} from "../shared/wecom_notify";

type MonitoredObjectType = "bug" | "story" | "task";
type SupportedEventType = "status_changed" | "assignee_changed";

interface MonitorConfig {
  enabled: boolean;
  stateFile: string;
  objectTypes: MonitoredObjectType[];
  products?: number[];
  executions?: number[];
  maxProducts: number;
  maxExecutions: number;
  limitPerScope: number;
  retentionDays: number;
}

interface SnapshotRecord extends JsonObject {
  object_type: MonitoredObjectType;
  id: number;
  status?: string;
  assigned_to?: string;
  last_seen_at: string;
}

interface MonitorState extends JsonObject {
  version: 1;
  updated_at: string;
  objects: Record<string, SnapshotRecord>;
}

interface MonitoredItem extends JsonObject {
  object_type: MonitoredObjectType;
  id: number;
  status?: string;
  assigned_to?: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      "state-file": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "reset-state": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const client = new ZentaoClient({ userid: values.userid });
  const config = readMonitorConfig(values["state-file"]);
  if (!config.enabled) {
    printJson({
      ok: true,
      type: "notification-monitor",
      enabled: false,
      state_file: config.stateFile,
      message: "notification_monitor.enabled is false",
    });
    return;
  }

  const previousState = values["reset-state"] ? emptyState() : readState(config.stateFile);
  const bootstrap = Object.keys(previousState.objects).length === 0;
  const nextState: MonitorState = {
    version: 1,
    updated_at: new Date().toISOString(),
    objects: { ...previousState.objects },
  };

  const items = await collectMonitoredItems(client, config);
  const notifications: JsonObject[] = [];
  const counters = {
    bug: 0,
    story: 0,
    task: 0,
  };

  for (const item of items) {
    counters[item.object_type] += 1;
    const key = buildStateKey(item.object_type, item.id);
    const previous = previousState.objects[key];
    const now = new Date().toISOString();

    if (!bootstrap && previous) {
      const previousStatus = normalizeText(previous.status);
      const currentStatus = normalizeText(item.status);
      if (previousStatus && currentStatus && previousStatus !== currentStatus) {
        notifications.push(await triggerNotification(item, previous, "status_changed"));
      }

      const previousAssignee = normalizeText(previous.assigned_to);
      const currentAssignee = normalizeText(item.assigned_to);
      if (previousAssignee !== currentAssignee) {
        notifications.push(await triggerNotification(item, previous, "assignee_changed"));
      }
    }

    nextState.objects[key] = {
      object_type: item.object_type,
      id: item.id,
      status: normalizeText(item.status),
      assigned_to: normalizeText(item.assigned_to),
      last_seen_at: now,
    };
  }

  pruneState(nextState, config.retentionDays);

  if (!values["dry-run"]) {
    writeState(config.stateFile, nextState);
  }

  printJson({
    ok: true,
    type: "notification-monitor",
    enabled: true,
    dry_run: values["dry-run"],
    reset_state: values["reset-state"],
    bootstrap,
    state_file: config.stateFile,
    scanned: {
      bug: counters.bug,
      story: counters.story,
      task: counters.task,
      total: items.length,
    },
    notifications,
  });
}

function readMonitorConfig(stateFileOverride?: string): MonitorConfig {
  const rawConfig = loadConfig() as unknown as JsonObject;
  const monitor = isJsonObject(rawConfig.notification_monitor) ? rawConfig.notification_monitor : {};

  return {
    enabled: normalizeBoolean(monitor.enabled, true),
    stateFile: path.resolve(
      stateFileOverride
        ?? getString(monitor, "state_file")
        ?? path.join(process.cwd(), "tmp/notification-monitor/state.json"),
    ),
    objectTypes: normalizeObjectTypes(monitor.object_types),
    products: normalizeNumberList(monitor.products),
    executions: normalizeNumberList(monitor.executions),
    maxProducts: normalizePositiveInteger(monitor.max_products, 20),
    maxExecutions: normalizePositiveInteger(monitor.max_executions, 20),
    limitPerScope: normalizePositiveInteger(monitor.limit_per_scope, 100),
    retentionDays: normalizePositiveInteger(monitor.retention_days, 30),
  };
}

async function collectMonitoredItems(client: ZentaoClient, config: MonitorConfig): Promise<MonitoredItem[]> {
  const items: MonitoredItem[] = [];
  const objectTypes = new Set(config.objectTypes);

  if (objectTypes.has("story") || objectTypes.has("bug")) {
    const productIds = await resolveProductIds(client, config);
    if (objectTypes.has("story")) {
      const storyItems = await collectStories(client, productIds, config.limitPerScope);
      items.push(...storyItems);
    }
    if (objectTypes.has("bug")) {
      const bugItems = await collectBugs(client, productIds, config.limitPerScope);
      items.push(...bugItems);
    }
  }

  if (objectTypes.has("task")) {
    const executionIds = await resolveExecutionIds(client, config);
    const taskItems = await collectTasks(client, executionIds, config.limitPerScope);
    items.push(...taskItems);
  }

  return items;
}

async function resolveProductIds(client: ZentaoClient, config: MonitorConfig): Promise<number[]> {
  if (config.products && config.products.length > 0) {
    return config.products;
  }

  const data = await client.getWebJsonViewData("/product-all.json");
  return extractObjectItems(data.productStats)
    .sort((left, right) => getNumericId(right.id) - getNumericId(left.id))
    .slice(0, config.maxProducts)
    .map((item) => getNumericId(item.id))
    .filter((id) => id > 0);
}

async function resolveExecutionIds(client: ZentaoClient, config: MonitorConfig): Promise<number[]> {
  if (config.executions && config.executions.length > 0) {
    return config.executions;
  }

  const data = await client.getWebJsonViewData("/execution-all.json");
  return extractObjectItems(data.executionStats)
    .sort((left, right) => getNumericId(right.id) - getNumericId(left.id))
    .slice(0, config.maxExecutions)
    .map((item) => getNumericId(item.id))
    .filter((id) => id > 0);
}

async function collectStories(client: ZentaoClient, productIds: number[], limitPerScope: number): Promise<MonitoredItem[]> {
  const items: MonitoredItem[] = [];
  for (const productId of productIds) {
    const route = `/story-browse-${productId}-all-0-id_desc-0-${limitPerScope}-1.json`;
    const data = await client.getWebJsonViewData(route);
    items.push(
      ...extractObjectItems(data.stories)
        .sort((left, right) => getNumericId(right.id) - getNumericId(left.id))
        .slice(0, limitPerScope)
        .map((story) => ({
          object_type: "story" as const,
          id: getNumericId(story.id),
          status: normalizeText(story.status),
          assigned_to: normalizeText(story.assignedTo),
        }))
        .filter((story) => story.id > 0),
    );
  }
  return deduplicateItems(items);
}

async function collectBugs(client: ZentaoClient, productIds: number[], limitPerScope: number): Promise<MonitoredItem[]> {
  const items: MonitoredItem[] = [];
  for (const productId of productIds) {
    const route = `/bug-browse-${productId}-all-0-id_desc-0-${limitPerScope}-1.json`;
    const data = await client.getWebJsonViewData(route);
    items.push(
      ...extractObjectItems(data.bugs)
        .sort((left, right) => getNumericId(right.id) - getNumericId(left.id))
        .slice(0, limitPerScope)
        .map((bug) => ({
          object_type: "bug" as const,
          id: getNumericId(bug.id),
          status: normalizeText(bug.status),
          assigned_to: normalizeText(bug.assignedTo),
        }))
        .filter((bug) => bug.id > 0),
    );
  }
  return deduplicateItems(items);
}

async function collectTasks(client: ZentaoClient, executionIds: number[], limitPerScope: number): Promise<MonitoredItem[]> {
  const items: MonitoredItem[] = [];
  for (const executionId of executionIds) {
    const data = await client.getWebJsonViewData(`/execution-task-${executionId}.json`);
    items.push(
      ...extractObjectItems(data.tasks)
        .sort((left, right) => getNumericId(right.id) - getNumericId(left.id))
        .slice(0, limitPerScope)
        .map((task) => ({
          object_type: "task" as const,
          id: getNumericId(task.id),
          status: normalizeText(task.status),
          assigned_to: normalizeText(task.assignedTo),
        }))
        .filter((task) => task.id > 0),
    );
  }
  return deduplicateItems(items);
}

async function triggerNotification(
  item: MonitoredItem,
  previous: SnapshotRecord,
  eventType: SupportedEventType,
): Promise<JsonObject> {
  try {
    if (item.object_type === "bug") {
      if (eventType === "status_changed") {
        return await notifyBugStatusChanged({
          bugId: item.id,
          oldStatus: previous.status,
          newStatus: item.status,
        });
      }
      return await notifyBugAssigned({
        bugId: item.id,
        oldAssignee: previous.assigned_to,
        newAssignee: item.assigned_to ?? "",
      });
    }

    if (item.object_type === "story") {
      if (eventType === "status_changed") {
        return await notifyStoryStatusChanged({
          storyId: item.id,
          oldStatus: previous.status,
          newStatus: item.status,
        });
      }
      return await notifyStoryAssigned({
        storyId: item.id,
        oldAssignee: previous.assigned_to,
        newAssignee: item.assigned_to ?? "",
      });
    }

    if (eventType === "status_changed") {
      return await notifyTaskStatusChanged({
        taskId: item.id,
        oldStatus: previous.status,
        newStatus: item.status,
      });
    }
    return await notifyTaskAssigned({
      taskId: item.id,
      oldAssignee: previous.assigned_to,
      newAssignee: item.assigned_to ?? "",
    });
  } catch (error) {
    return {
      ok: false,
      object_type: item.object_type,
      event_type: eventType,
      entity_id: item.id,
      skipped_reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function deduplicateItems(items: MonitoredItem[]): MonitoredItem[] {
  const map = new Map<string, MonitoredItem>();
  for (const item of items) {
    map.set(buildStateKey(item.object_type, item.id), item);
  }
  return Array.from(map.values());
}

function buildStateKey(objectType: MonitoredObjectType, id: number): string {
  return `${objectType}:${id}`;
}

function emptyState(): MonitorState {
  return {
    version: 1,
    updated_at: new Date(0).toISOString(),
    objects: {},
  };
}

function readState(stateFile: string): MonitorState {
  if (!existsSync(stateFile)) {
    return emptyState();
  }

  const parsed = JSON.parse(readFileSync(stateFile, "utf8")) as JsonObject;
  if (!isJsonObject(parsed.objects)) {
    return emptyState();
  }

  const objects: Record<string, SnapshotRecord> = {};
  for (const [key, value] of Object.entries(parsed.objects)) {
    if (!isJsonObject(value)) {
      continue;
    }
    const objectType = normalizeObjectType(value.object_type);
    const id = getNumericId(value.id);
    if (!objectType || id <= 0) {
      continue;
    }
    objects[key] = {
      object_type: objectType,
      id,
      status: normalizeText(value.status),
      assigned_to: normalizeText(value.assigned_to),
      last_seen_at: getString(value, "last_seen_at") ?? new Date(0).toISOString(),
    };
  }

  return {
    version: 1,
    updated_at: getString(parsed, "updated_at") ?? new Date(0).toISOString(),
    objects,
  };
}

function writeState(stateFile: string, state: MonitorState): void {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function pruneState(state: MonitorState, retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const [key, value] of Object.entries(state.objects)) {
    const timestamp = Date.parse(value.last_seen_at);
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      delete state.objects[key];
    }
  }
}

function extractObjectItems(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => isJsonObject(item));
  }
  if (isJsonObject(value)) {
    return Object.values(value).filter((item): item is JsonObject => isJsonObject(item));
  }
  return [];
}

function normalizeObjectTypes(value: JsonValue | undefined): MonitoredObjectType[] {
  const items = normalizeStringList(value)
    .map((item) => normalizeObjectType(item))
    .filter((item): item is MonitoredObjectType => Boolean(item));
  return items.length > 0 ? Array.from(new Set(items)) : ["story", "bug", "task"];
}

function normalizeObjectType(value: JsonValue | undefined): MonitoredObjectType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "story" || normalized === "bug" || normalized === "task") {
    return normalized;
  }
  return undefined;
}

function normalizeNumberList(value: JsonValue | undefined): number[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim())
      : [];
  const numbers = values
    .map((item) => getNumericId(item))
    .filter((item) => item > 0);
  return numbers.length > 0 ? Array.from(new Set(numbers)) : undefined;
}

function normalizeStringList(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item)))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeBoolean(value: JsonValue | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizePositiveInteger(value: JsonValue | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function getNumericId(value: JsonValue | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function normalizeText(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function getString(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

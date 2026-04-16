import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { notifyBugAssigned, notifyBugStatusChanged, notifyStoryAssigned, notifyStoryStatusChanged, notifyTaskAssigned, notifyTaskStatusChanged } from "../shared/wecom_notify";
import { ZentaoClient, type JsonObject, type JsonValue } from "../shared/zentao_client";

type SupportedObjectType = "task" | "bug" | "story";

interface ZentaoWebhookPayload extends JsonObject {
  objectType: SupportedObjectType;
  objectID: number;
  action?: string;
  actor?: string;
  date?: string;
  comment?: string;
  text?: string;
  product?: JsonValue;
  execution?: JsonValue;
}

const HOST = (process.env.ZENTAO_WEBHOOK_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
const PORT = normalizePort(process.env.ZENTAO_WEBHOOK_PORT, 37812);
const WEBHOOK_PATH = normalizePath(process.env.ZENTAO_WEBHOOK_PATH ?? "/zentao/webhook");
const HEALTH_PATH = normalizePath(process.env.ZENTAO_WEBHOOK_HEALTH_PATH ?? "/healthz");
const DEDUPE_WINDOW_MS = normalizePositiveInteger(process.env.ZENTAO_WEBHOOK_DEDUPE_WINDOW_MS, 2 * 60 * 1000);
const MAX_BODY_BYTES = normalizePositiveInteger(process.env.ZENTAO_WEBHOOK_MAX_BODY_BYTES, 64 * 1024);
const recentEvents = new Map<string, number>();

const TASK_STATUS_ACTIONS = new Set([
  "confirmed",
  "started",
  "finished",
  "paused",
  "canceled",
  "restarted",
  "closed",
  "activated",
]);
const BUG_STATUS_ACTIONS = new Set([
  "confirmed",
  "bugconfirmed",
  "resolved",
  "closed",
  "activated",
]);
const STORY_STATUS_ACTIONS = new Set([
  "changed",
  "reviewed",
  "closed",
  "activated",
]);

function normalizePort(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return Math.floor(parsed);
}

function normalizePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizePayload(value: JsonValue): ZentaoWebhookPayload | null {
  if (!isJsonObject(value)) return null;
  const objectTypeRaw = normalizeString(value.objectType)?.toLowerCase();
  const objectID = normalizeNumber(value.objectID);
  if (!objectTypeRaw || !objectID) return null;
  if (objectTypeRaw !== "task" && objectTypeRaw !== "bug" && objectTypeRaw !== "story") return null;
  return {
    objectType: objectTypeRaw,
    objectID,
    action: normalizeString(value.action)?.toLowerCase(),
    actor: normalizeString(value.actor),
    date: normalizeString(value.date),
    comment: normalizeString(value.comment),
    text: normalizeString(value.text),
    product: value.product,
    execution: value.execution,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, statusCode: number, body: JsonObject): void {
  const content = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(content));
  res.end(content);
}

function log(message: string, extra?: JsonObject): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  process.stdout.write(`[zentao-webhook] ${message}${suffix}\n`);
}

function buildDedupKey(payload: ZentaoWebhookPayload): string {
  return [
    payload.objectType,
    payload.objectID,
    payload.action ?? "",
    payload.actor ?? "",
    payload.date ?? "",
  ].join(":");
}

function rememberEvent(key: string): boolean {
  const now = Date.now();
  for (const [existingKey, timestamp] of recentEvents.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) recentEvents.delete(existingKey);
  }
  const existing = recentEvents.get(key);
  if (existing && now - existing <= DEDUPE_WINDOW_MS) return true;
  recentEvents.set(key, now);
  return false;
}

function isRelevantAction(payload: ZentaoWebhookPayload): boolean {
  if (!payload.action) return false;
  if (payload.action === "assigned") return true;
  if (payload.objectType === "task") return TASK_STATUS_ACTIONS.has(payload.action);
  if (payload.objectType === "bug") return BUG_STATUS_ACTIONS.has(payload.action);
  return STORY_STATUS_ACTIONS.has(payload.action);
}

async function fetchCurrentField(
  objectType: SupportedObjectType,
  objectID: number,
  field: "assignedTo" | "status",
  operatorUserid?: string,
): Promise<string | undefined> {
  const client = new ZentaoClient({ userid: operatorUserid });
  const route = `/${objectType}-view-${objectID}.json`;
  const data = await client.getWebJsonViewData(route);
  const entity = isJsonObject(data[objectType]) ? data[objectType] : data;
  return normalizeString(entity[field]);
}

async function dispatchNotification(payload: ZentaoWebhookPayload): Promise<void> {
  if (!payload.action || !isRelevantAction(payload)) {
    log("skip unsupported webhook action", {
      object_type: payload.objectType,
      object_id: payload.objectID,
      action: payload.action ?? "",
    });
    return;
  }

  if (payload.action === "assigned") {
    const currentAssignee = await fetchCurrentField(payload.objectType, payload.objectID, "assignedTo", payload.actor);
    if (!currentAssignee) {
      log("skip assign notification because current assignee is empty", {
        object_type: payload.objectType,
        object_id: payload.objectID,
        actor: payload.actor ?? "",
      });
      return;
    }

    if (payload.objectType === "task") {
      const result = await notifyTaskAssigned({
        taskId: payload.objectID,
        operatorUserid: payload.actor,
        newAssignee: currentAssignee,
        comment: payload.comment,
      });
      log("task assign notification processed", result);
      return;
    }
    if (payload.objectType === "bug") {
      const result = await notifyBugAssigned({
        bugId: payload.objectID,
        operatorUserid: payload.actor,
        newAssignee: currentAssignee,
        comment: payload.comment,
      });
      log("bug assign notification processed", result);
      return;
    }

    const result = await notifyStoryAssigned({
      storyId: payload.objectID,
      operatorUserid: payload.actor,
      newAssignee: currentAssignee,
      comment: payload.comment,
    });
    log("story assign notification processed", result);
    return;
  }

  if (payload.objectType === "task") {
    const currentStatus = await fetchCurrentField("task", payload.objectID, "status", payload.actor);
    const result = await notifyTaskStatusChanged({
      taskId: payload.objectID,
      operatorUserid: payload.actor,
      newStatus: currentStatus,
      comment: payload.comment,
    });
    log("task status notification processed", result);
    return;
  }
  if (payload.objectType === "bug") {
    const currentStatus = await fetchCurrentField("bug", payload.objectID, "status", payload.actor);
    const result = await notifyBugStatusChanged({
      bugId: payload.objectID,
      operatorUserid: payload.actor,
      newStatus: currentStatus,
      comment: payload.comment,
    });
    log("bug status notification processed", result);
    return;
  }

  const currentStatus = await fetchCurrentField("story", payload.objectID, "status", payload.actor);
  const result = await notifyStoryStatusChanged({
    storyId: payload.objectID,
    operatorUserid: payload.actor,
    newStatus: currentStatus,
    comment: payload.comment,
  });
  log("story status notification processed", result);
}

async function processWithRetry(payload: ZentaoWebhookPayload): Promise<void> {
  const delays = [200, 800, 1500];
  let lastError: unknown;
  for (let index = 0; index < delays.length; index += 1) {
    try {
      if (index > 0) await sleep(delays[index]);
      await dispatchNotification(payload);
      return;
    } catch (error) {
      lastError = error;
      log("dispatch failed, will retry if attempts remain", {
        attempt: index + 1,
        object_type: payload.objectType,
        object_id: payload.objectID,
        action: payload.action ?? "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const server = createServer(async (req, res) => {
  const requestPath = normalizePath((req.url ?? "/").split("?")[0] ?? "/");

  if (req.method === "GET" && requestPath === HEALTH_PATH) {
    sendJson(res, 200, { ok: true, service: "zentao-webhook-server" });
    return;
  }

  if (req.method !== "POST" || requestPath !== WEBHOOK_PATH) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  try {
    const bodyText = await readBody(req);
    const parsed = JSON.parse(bodyText) as JsonValue;
    const payload = normalizePayload(parsed);
    if (!payload) {
      sendJson(res, 400, { ok: false, error: "invalid_payload" });
      return;
    }

    const dedupKey = buildDedupKey(payload);
    if (rememberEvent(dedupKey)) {
      sendJson(res, 200, { ok: true, duplicate: true });
      return;
    }

    sendJson(res, 200, { ok: true, accepted: true });
    void processWithRetry(payload).catch((error) => {
      log("dispatch failed after retries", {
        object_type: payload.objectType,
        object_id: payload.objectID,
        action: payload.action ?? "",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    log("request handling failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(PORT, HOST, () => {
  log("server started", {
    host: HOST,
    port: PORT,
    webhook_path: WEBHOOK_PATH,
    health_path: HEALTH_PATH,
  });
});

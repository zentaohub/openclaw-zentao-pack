import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildMissingArgsReply, buildScriptErrorReply, buildScriptResultReply } from "./wecom_reply_formatter";
import {
  collectMissingArgs,
  loadIntentRoutes,
  type IntentRoute,
} from "./wecom_route_resolver";
import { appendInteractiveAudit } from "./wecom_interactive_audit";
import {
  createInteractiveOperationId,
  getInteractiveActionDefinition,
  parseInteractiveActionKey,
} from "./wecom_interactive_registry";
import { clearBugCreateFlow, resolveBugCreateInteractiveAction } from "./bug_create_flow";
import {
  validateInteractiveAction,
  type InteractiveEntityType,
} from "./wecom_interactive_rules";
import {
  hasHandledInteractiveOperation,
  markInteractiveOperationHandled,
} from "./wecom_interactive_state";
import {
  detectWecomMessageSource,
  extractInteractiveEvent,
  parseJsonInput,
  type WecomInteractiveEvent,
  type WecomMessagePayload,
  type WecomMessageSource,
} from "../shared/wecom_payload";
import {
  type JsonObject,
} from "../shared/zentao_client";

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");

interface NpmRunner {
  command: string;
  baseArgs: string[];
}

function normalizeReplyText(message: string): string {
  return message.trim() || "卡片交互已接收。";
}

function normalizeCliArgMap(args: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const fallbackUserid = typeof args.userid === "string" && args.userid.trim() && args.userid.trim() !== "current_user"
    ? args.userid.trim()
    : "";

  for (const [rawKey, rawValue] of Object.entries(args)) {
    const key = rawKey.trim();
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !value || key === "current_user") {
      continue;
    }

    const normalizedKey = key === "user_id" ? "userid" : key;
    const normalizedValue = value === "current_user"
      ? (normalizedKey === "userid" ? fallbackUserid : "")
      : value;

    if (!normalizedValue) {
      continue;
    }

    if (normalizedKey === "userid" && normalized.userid) {
      continue;
    }

    normalized[normalizedKey] = normalizedValue;
  }

  return normalized;
}

function toCliArgs(args: Record<string, string>): string[] {
  const entries = Object.entries(normalizeCliArgMap(args));
  const cliArgs: string[] = [];
  for (const [key, value] of entries) {
    cliArgs.push(`--${key}`, value);
  }
  return cliArgs;
}

function resolveNpmRunner(): NpmRunner {
  const cliCandidates = [
    process.env.OPENCLAW_NPM_CLI_PATH,
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../node_modules/npm/bin/npm-cli.js"),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of cliCandidates) {
    if (existsSync(candidate)) {
      return {
        command: process.execPath,
        baseArgs: [candidate],
      };
    }
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    baseArgs: [],
  };
}

function execNpmScript(scriptName: string, scriptArgs: string[]): string {
  const runner = resolveNpmRunner();
  return execFileSync(runner.command, [...runner.baseArgs, "run", "--silent", scriptName, "--", ...scriptArgs], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
  }).trim();
}

function runScript(route: IntentRoute, args: Record<string, string>): JsonObject {
  try {
    const output = execNpmScript(route.script, toCliArgs(args));
    return parseJsonInput(output, `npm run ${route.script}`) as JsonObject;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      route_script: route.script,
      route_args: args,
    } satisfies JsonObject;
  }
}

function findRouteByScript(scriptName: string): IntentRoute | null {
  return loadIntentRoutes().find((route) => route.script === scriptName) ?? null;
}

function buildSelectionMap(event: WecomInteractiveEvent): Record<string, string[]> {
  const selections: Record<string, string[]> = {};
  for (const item of event.selectedItems) {
    if (!item.questionKey) {
      continue;
    }
    selections[item.questionKey] = item.optionIds;
  }
  return selections;
}

function pickFirstSelection(selections: Record<string, string[]>, questionKey: string): string | undefined {
  const values = selections[questionKey];
  return Array.isArray(values) && values.length > 0 ? values[0] : undefined;
}

function buildDefaultComment(statusOrAction: string, entityType: "task" | "bug" | "story"): string {
  const entityLabel = entityType === "story" ? "需求" : entityType === "bug" ? "Bug" : "任务";
  return `通过企业微信卡片交互执行${entityLabel}${statusOrAction}`;
}

function buildDefaultReleaseDesc(status: string): string {
  return `通过企业微信卡片交互更新发布状态为 ${status}`;
}

function buildDefaultTestCaseReal(result: string): string {
  return `通过企业微信卡片提交测试结果：${result}`;
}

function applyTaskDefaults(args: Record<string, string>): Record<string, string> {
  if (args.status === "done") {
    if (!args["consumed-hours"]) {
      args["consumed-hours"] = "0";
    }
    if (!args["left-hours"]) {
      args["left-hours"] = "0";
    }
  }
  return args;
}

function applyBugDefaults(args: Record<string, string>): Record<string, string> {
  if (args.status === "resolve" && !args.resolution) {
    args.resolution = "fixed";
  }
  return args;
}

function normalizeStoryReviewResult(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === "needs-work") {
    return "clarify";
  }
  return raw;
}

function buildInteractiveRouteArgs(
  actionKey: string,
  basePayload: Record<string, string>,
  event: WecomInteractiveEvent,
  userid: string,
): Record<string, string> {
  const selections = buildSelectionMap(event);
  const args: Record<string, string> = {
    ...basePayload,
    userid,
  };

  switch (actionKey) {
    case "task.detail.open":
    case "task.mine.refresh":
    case "task.mine.query-bugs":
    case "bug.detail.open":
      return args;
    case "task.status.start":
    case "task.status.finish":
    case "task.status.block":
      args.status = args.status || pickFirstSelection(selections, "status") || "doing";
      if (pickFirstSelection(selections, "comment_mode") !== "silent" && !args.comment) {
        args.comment = buildDefaultComment(args.status, "task");
      }
      return applyTaskDefaults(args);
    case "task.status.submit":
      args.status = pickFirstSelection(selections, "status") || args.status;
      if (pickFirstSelection(selections, "comment_mode") !== "silent" && !args.comment && args.status) {
        args.comment = buildDefaultComment(args.status, "task");
      }
      return applyTaskDefaults(args);
    case "bug.status.activate":
    case "bug.status.resolve":
    case "bug.status.close":
      args.status = args.status || pickFirstSelection(selections, "status") || "activate";
      if (pickFirstSelection(selections, "comment_mode") !== "silent" && !args.comment) {
        args.comment = buildDefaultComment(args.status, "bug");
      }
      return applyBugDefaults(args);
    case "bug.status.submit":
      args.status = pickFirstSelection(selections, "status") || args.status;
      if (pickFirstSelection(selections, "comment_mode") !== "silent" && !args.comment && args.status) {
        args.comment = buildDefaultComment(args.status, "bug");
      }
      return applyBugDefaults(args);
    case "story.review.submit": {
      const reviewResult = normalizeStoryReviewResult(pickFirstSelection(selections, "review_result") || args.result);
      if (reviewResult) {
        args.result = reviewResult;
      }
      if (reviewResult === "reject" && !args["closed-reason"]) {
        args["closed-reason"] = "willnotdo";
      }
      if (!args.comment && reviewResult) {
        args.comment = buildDefaultComment(reviewResult, "story");
      }
      return args;
    }
    case "story.status.submit":
      args.status = pickFirstSelection(selections, "status") || args.status;
      if (args.status === "close") {
        args["closed-reason"] = pickFirstSelection(selections, "closed_reason") || args["closed-reason"] || "done";
      }
      if (pickFirstSelection(selections, "comment_mode") !== "silent" && !args.comment && args.status) {
        args.comment = buildDefaultComment(args.status, "story");
      }
      return args;
    case "release.status.submit":
      args.status = pickFirstSelection(selections, "status") || args.status;
      if (pickFirstSelection(selections, "desc_mode") !== "silent" && !args.desc && args.status) {
        args.desc = buildDefaultReleaseDesc(args.status);
      }
      return args;
    case "testtask.case.run.submit":
      args.result = pickFirstSelection(selections, "result") || args.result || "pass";
      if (pickFirstSelection(selections, "real_mode") !== "silent" && !args.real && args.result) {
        args.real = buildDefaultTestCaseReal(args.result);
      }
      return args;
    default:
      return args;
  }
}

function buildOperationTaskId(event: WecomInteractiveEvent, payload: Record<string, string>): string {
  return event.taskId || payload.task || payload.bug || payload.story || payload.release || "interactive";
}

function buildInteractiveReply(message: string, extra: JsonObject = {}): JsonObject {
  return {
    ok: true,
    ...extra,
    reply_text: normalizeReplyText(message),
  } satisfies JsonObject;
}

function normalizeStatus(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
}

function resolveEntityQuery(actionKey: string, payload: Record<string, string>): {
  entityType: InteractiveEntityType;
  id: string;
  routeScript: string;
} | null {
  if (actionKey.startsWith("task.status.") && payload.task) {
    return { entityType: "task", id: payload.task, routeScript: "query-task-detail" };
  }
  if (actionKey.startsWith("bug.status.") && payload.bug) {
    return { entityType: "bug", id: payload.bug, routeScript: "query-bug-detail" };
  }
  if (actionKey === "story.review.submit" && payload.story) {
    return { entityType: "story", id: payload.story, routeScript: "query-story-detail" };
  }
  if (actionKey === "story.status.submit" && payload.story) {
    return { entityType: "story", id: payload.story, routeScript: "query-story-detail" };
  }
  if (actionKey === "release.status.submit" && payload.release) {
    return { entityType: "release", id: payload.release, routeScript: "query-release-detail" };
  }
  return null;
}

function extractEntityStatus(entityType: InteractiveEntityType, result: JsonObject): string | undefined {
  const detail = result.detail && typeof result.detail === "object" && !Array.isArray(result.detail)
    ? result.detail as JsonObject
    : undefined;

  if (entityType === "task" || entityType === "bug" || entityType === "story" || entityType === "release") {
    return normalizeStatus(detail?.status ?? result.status);
  }
  return undefined;
}

function fetchCurrentEntityStatus(actionKey: string, payload: Record<string, string>, userid: string): {
  entityType: InteractiveEntityType;
  status?: string;
} | null {
  const entityQuery = resolveEntityQuery(actionKey, payload);
  if (!entityQuery) {
    return null;
  }

  const route = findRouteByScript(entityQuery.routeScript);
  if (!route) {
    return {
      entityType: entityQuery.entityType,
      status: undefined,
    };
  }

  const queryArgs = {
    userid,
    [entityQuery.entityType]: entityQuery.id,
  };
  const scriptResult = runScript(route, queryArgs);
  if (scriptResult.ok === false) {
    return {
      entityType: entityQuery.entityType,
      status: undefined,
    };
  }

  return {
    entityType: entityQuery.entityType,
    status: extractEntityStatus(entityQuery.entityType, scriptResult),
  };
}

export async function dispatchInteractiveCallback(
  payload: WecomMessagePayload,
  userid: string,
): Promise<JsonObject | null> {
  const event = extractInteractiveEvent(payload);
  if (!event) {
    return null;
  }

  const sourceType: WecomMessageSource = detectWecomMessageSource(payload);
  const parsedAction = parseInteractiveActionKey(event.eventKey);
  if (!parsedAction) {
    return buildInteractiveReply(`收到卡片交互，但暂不支持识别该动作: ${event.eventKey || "unknown"}`, {
      userid,
      message_source: sourceType,
      route_source: "interactive",
      interactive_event: event as unknown as JsonObject,
      ok: false,
    });
  }

  const definition = getInteractiveActionDefinition(parsedAction.actionKey);
  if (!definition) {
    return buildInteractiveReply(`收到卡片交互，但该动作尚未注册执行器: ${parsedAction.actionKey}`, {
      userid,
      message_source: sourceType,
      route_source: "interactive",
      interactive_event: event as unknown as JsonObject,
      ok: false,
      interactive_action: parsedAction.actionKey,
    });
  }

  const operationId = createInteractiveOperationId({
    userid,
    taskId: buildOperationTaskId(event, parsedAction.payload),
    actionKey: parsedAction.actionKey,
    payload: {
      ...parsedAction.payload,
      ...Object.fromEntries(
        Object.entries(buildSelectionMap(event)).map(([key, values]) => [key, values.join(",")]),
      ),
    },
  });

  appendInteractiveAudit({
    userid,
    task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
    action_key: parsedAction.actionKey,
    operation_id: operationId,
    status: "received",
    route_script: definition.routeScript,
    payload: {
      event_key: event.eventKey,
      response_code: event.responseCode,
      selected_items: event.selectedItems as unknown as JsonObject["selected_items"],
      ...parsedAction.payload,
    },
  });

  if (hasHandledInteractiveOperation(operationId)) {
    appendInteractiveAudit({
      userid,
      task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
      action_key: parsedAction.actionKey,
      operation_id: operationId,
      status: "skipped",
      route_script: definition.routeScript,
      message: "duplicate interactive callback skipped",
    });
    return buildInteractiveReply("该卡片操作已处理，请查看上一条结果。", {
      userid,
      message_source: sourceType,
      route_source: "interactive",
      interactive_action: parsedAction.actionKey,
      interactive_operation_id: operationId,
    });
  }

  const bugCreateInteractive = resolveBugCreateInteractiveAction(parsedAction.actionKey, userid);
  if (bugCreateInteractive) {
    if (bugCreateInteractive.kind === "reply") {
      markInteractiveOperationHandled(operationId);
      appendInteractiveAudit({
        userid,
        task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
        action_key: parsedAction.actionKey,
        operation_id: operationId,
        status: "completed",
        route_script: definition.routeScript,
        payload: parsedAction.payload,
      });
      return {
        ...bugCreateInteractive.result,
        message_source: sourceType,
        route_source: "interactive",
        interactive_action: parsedAction.actionKey,
        interactive_operation_id: operationId,
        interactive_task_id: event.taskId,
        interactive_selected: buildSelectionMap(event),
      } satisfies JsonObject;
    }

    const route = findRouteByScript("create-bug");
    if (!route) {
      appendInteractiveAudit({
        userid,
        task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
        action_key: parsedAction.actionKey,
        operation_id: operationId,
        status: "failed",
        route_script: "create-bug",
        message: "route script not found in intent-routing.yaml",
      });
      return buildInteractiveReply("Bug 创建动作已识别，但未找到 create-bug 路由。", {
        userid,
        message_source: sourceType,
        route_source: "interactive",
        interactive_action: parsedAction.actionKey,
        interactive_operation_id: operationId,
        ok: false,
      });
    }

    const args = {
      ...bugCreateInteractive.routeArgs,
      userid,
    };
    const scriptResult = runScript(route, args);
    const result = {
      ...scriptResult,
      ok: scriptResult.ok === undefined ? true : scriptResult.ok,
      userid,
      message_source: sourceType,
      route_source: "interactive",
      intent: route.intent,
      matched_by: `interactive:${parsedAction.actionKey}`,
      route_script: route.script,
      route_args: args,
      interactive_action: parsedAction.actionKey,
      interactive_operation_id: operationId,
      interactive_task_id: event.taskId,
      interactive_selected: buildSelectionMap(event),
      reply_text: scriptResult.ok === false
        ? buildScriptErrorReply(route, scriptResult)
        : buildScriptResultReply(route, scriptResult, userid, sourceType, args),
    } satisfies JsonObject;

    if (scriptResult.ok === false) {
      appendInteractiveAudit({
        userid,
        task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
        action_key: parsedAction.actionKey,
        operation_id: operationId,
        status: "failed",
        route_script: route.script,
        message: typeof scriptResult.error === "string" ? scriptResult.error : "interactive script failed",
        payload: args,
      });
      return result;
    }

    clearBugCreateFlow(userid);
    markInteractiveOperationHandled(operationId);
    appendInteractiveAudit({
      userid,
      task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
      action_key: parsedAction.actionKey,
      operation_id: operationId,
      status: "completed",
      route_script: route.script,
      payload: args,
    });
    return result;
  }

  if (!definition.routeScript) {
    return buildInteractiveReply(`收到卡片交互，但该动作尚未注册执行脚本: ${parsedAction.actionKey}`, {
      userid,
      message_source: sourceType,
      route_source: "interactive",
      interactive_action: parsedAction.actionKey,
      interactive_operation_id: operationId,
      ok: false,
    });
  }

  const route = findRouteByScript(definition.routeScript);
  if (!route) {
    appendInteractiveAudit({
      userid,
      task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
      action_key: parsedAction.actionKey,
      operation_id: operationId,
      status: "failed",
      route_script: definition.routeScript,
      message: "route script not found in intent-routing.yaml",
    });
    return buildInteractiveReply(`卡片动作已识别，但未找到路由脚本: ${definition.routeScript}`, {
      userid,
      message_source: sourceType,
      route_source: "interactive",
      interactive_action: parsedAction.actionKey,
      interactive_operation_id: operationId,
      ok: false,
    });
  }

  const args = buildInteractiveRouteArgs(parsedAction.actionKey, parsedAction.payload, event, userid);
  const currentEntityState = fetchCurrentEntityStatus(parsedAction.actionKey, args, userid);
  if (currentEntityState) {
    const validation = validateInteractiveAction({
      actionKey: parsedAction.actionKey,
      entityType: currentEntityState.entityType,
      currentStatus: currentEntityState.status,
      targetStatus: args.status ?? args.result,
    });
    if (!validation.allowed) {
      appendInteractiveAudit({
        userid,
        task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
        action_key: parsedAction.actionKey,
        operation_id: operationId,
        status: "failed",
        route_script: route.script,
        message: validation.reason ?? "interactive action denied by state rules",
        payload: {
          ...args,
          current_status: currentEntityState.status,
        },
      });
      return {
        ok: false,
        userid,
        message_source: sourceType,
        route_source: "interactive",
        intent: route.intent,
        matched_by: `interactive:${parsedAction.actionKey}`,
        route_script: route.script,
        route_args: args,
        interactive_action: parsedAction.actionKey,
        interactive_operation_id: operationId,
        interactive_task_id: event.taskId,
        interactive_selected: buildSelectionMap(event),
        current_status: currentEntityState.status ?? null,
        reply_text: validation.reason ?? "当前状态不允许执行该操作，请刷新卡片后重试。",
      } satisfies JsonObject;
    }
  }

  const missingArgs = collectMissingArgs(route, args);
  if (missingArgs.length > 0) {
    appendInteractiveAudit({
      userid,
      task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
      action_key: parsedAction.actionKey,
      operation_id: operationId,
      status: "failed",
      route_script: route.script,
      message: `missing args: ${missingArgs.join(", ")}`,
      payload: args,
    });
    return {
      ok: false,
      userid,
      message_source: sourceType,
      route_source: "interactive",
      intent: route.intent,
      matched_by: `interactive:${parsedAction.actionKey}`,
      route_script: route.script,
      route_args: args,
      missing_args: missingArgs,
      interactive_action: parsedAction.actionKey,
      interactive_operation_id: operationId,
      interactive_task_id: event.taskId,
      interactive_selected: buildSelectionMap(event),
      reply_text: buildMissingArgsReply(route, missingArgs),
    } satisfies JsonObject;
  }

  const scriptResult = runScript(route, args);
  const result = {
    ...scriptResult,
    ok: scriptResult.ok === undefined ? true : scriptResult.ok,
    userid,
    message_source: sourceType,
    route_source: "interactive",
    intent: route.intent,
    matched_by: `interactive:${parsedAction.actionKey}`,
    route_script: route.script,
    route_args: args,
    interactive_action: parsedAction.actionKey,
    interactive_operation_id: operationId,
    interactive_task_id: event.taskId,
    interactive_selected: buildSelectionMap(event),
    reply_text: scriptResult.ok === false
      ? buildScriptErrorReply(route, scriptResult)
      : buildScriptResultReply(route, scriptResult, userid, sourceType, args),
  } satisfies JsonObject;

  if (scriptResult.ok === false) {
    appendInteractiveAudit({
      userid,
      task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
      action_key: parsedAction.actionKey,
      operation_id: operationId,
      status: "failed",
      route_script: route.script,
      message: typeof scriptResult.error === "string" ? scriptResult.error : "interactive script failed",
      payload: args,
    });
    return result;
  }

  markInteractiveOperationHandled(operationId);
  appendInteractiveAudit({
    userid,
    task_id: event.taskId || buildOperationTaskId(event, parsedAction.payload),
    action_key: parsedAction.actionKey,
    operation_id: operationId,
    status: "completed",
    route_script: route.script,
    payload: args,
  });
  return result;
}

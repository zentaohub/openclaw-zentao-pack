import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { printJson, type JsonObject, type JsonValue } from "../shared/zentao_client";
import { handleContactSyncPayload, isContactSyncPayload } from "./wecom_contact_sync";
import {
  detectWecomMessageSource,
  extractAttachmentInfo,
  extractText,
  extractUserid,
  parseJsonInput,
  type WecomMessagePayload,
} from "../shared/wecom_payload";
import { classifyWecomIntentWithLlm, type LlmIntentDecision } from "./llm_intent_router";
import { buildMissingArgsReply, buildRouteHelpText, buildScriptErrorReply, buildScriptResultReply } from "./wecom_reply_formatter";
import { collectMissingArgs, extractRouteArgs, findRouteByIntent, findRouteMatch, loadIntentRoutes, normalizeRouteArgs, type IntentRoute, type RouteMatch } from "./wecom_route_resolver";
import { WecomClient } from "../shared/wecom_client";

interface CallbackPayload extends JsonObject {
  content?: string;
  text?: string;
  msgtype?: string;
  MsgType?: string;
  reply_format?: string;
  body?: JsonValue;
}

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const IMPORT_TASK_TRIGGERS = [
  "导入任务",
  "批量导入任务",
  "excel导入任务",
  "导任务",
];

interface ImportTaskCommand {
  sourceUrl?: string;
  execution?: string;
  assignedTo?: string;
}

interface NpmRunner {
  command: string;
  baseArgs: string[];
  displayName: string;
}

function normalizeReplyFormat(value: string | undefined): "text" | "template_card" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "template_card" || normalized === "card") {
    return "template_card";
  }
  return "text";
}

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1))}…`;
}

function maybeWrapReplyAsTemplateCard(
  result: JsonObject,
  replyFormat: "text" | "template_card",
  userid: string,
): JsonObject {
  if (replyFormat !== "template_card") {
    return result;
  }

  const currentReplyText = typeof result.reply_text === "string" ? result.reply_text.trim() : "";
  if (!currentReplyText) {
    return result;
  }

  if (currentReplyText.startsWith("{") && currentReplyText.includes("\"template_card\"")) {
    return result;
  }

  const intent = typeof result.intent === "string" ? result.intent : "zentao-callback";
  const templateCard = {
    card_type: "text_notice",
    source: {
      desc: "禅道助手",
      desc_color: 0,
    },
    main_title: {
      title: "禅道处理结果",
      desc: `用户: ${userid}`,
    },
    task_id: `${intent}-${Date.now()}`,
    sub_title_text: truncateText(currentReplyText, 1200),
  };

  return {
    ...result,
    reply_text: JSON.stringify({ template_card: templateCard }),
    reply_format: "template_card",
  } satisfies JsonObject;
}

function toCliArgs(args: Record<string, string>): string[] {
  const entries = Object.entries(args).filter(([, value]) => typeof value === "string" && value.trim());
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
        displayName: candidate,
      };
    }
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    baseArgs: [],
    displayName: process.platform === "win32" ? "npm.cmd" : "npm",
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

function extractSourceUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/\S+/iu);
  return match?.[0]?.replace(/[)\]}>，。；;]+$/u, "");
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function isImportTaskRequest(text: string, payload: WecomMessagePayload): boolean {
  if (IMPORT_TASK_TRIGGERS.some((trigger) => text.includes(trigger))) {
    return true;
  }

  return extractAttachmentInfo(payload) !== null;
}

function extractImportTaskCommand(text: string): ImportTaskCommand {
  const command: ImportTaskCommand = {};
  command.sourceUrl = extractSourceUrl(text);

  const executionMatch = text.match(/(?:执行|迭代|execution)\s*[#：:=-]?\s*(\d+)/iu);
  if (executionMatch?.[1]) {
    command.execution = executionMatch[1];
  }

  const assignedToMatch = text.match(/(?:指派给|负责人|assigned-to|assignedto)\s*[#：:=-]?\s*([^\s，。,；;]+)/iu);
  if (assignedToMatch?.[1]) {
    command.assignedTo = assignedToMatch[1].trim();
  }

  return command;
}

async function dispatchImportTask(text: string, userid: string, payload: WecomMessagePayload): Promise<JsonObject> {
  const command = extractImportTaskCommand(text);
  const attachment = extractAttachmentInfo(payload);
  const missingArgs: string[] = [];
  if (!command.sourceUrl && !attachment) {
    missingArgs.push("Excel/CSV 地址或企微附件");
  }
  if (!command.execution) {
    missingArgs.push("execution/执行ID");
  }

  if (missingArgs.length > 0) {
    return {
      ok: true,
      userid,
      intent: "import-tasks-from-excel",
      missing_args: missingArgs,
      reply_text: [
        "已识别为批量导入任务请求。",
        `当前缺少必要参数：${missingArgs.join("、")}`,
        "示例：导入任务 https://example.com/tasks.xlsx 执行 12",
      ].join("\n"),
    };
  }

  let tempFilePath: string | null = null;
  try {
    const cliArgs = ["--execution", command.execution as string, "--userid", userid];
    if (command.sourceUrl) {
      cliArgs.push("--source-url", command.sourceUrl);
    } else if (attachment) {
      const wecomClient = new WecomClient();
      const mediaFile = await wecomClient.downloadMedia(attachment.mediaId, attachment.filename);
      const filename = sanitizeFilename(mediaFile.filename || `${attachment.mediaId}.bin`);
      tempFilePath = path.join(tmpdir(), `openclaw-zentao-import-${Date.now()}-${filename}`);
      writeFileSync(tempFilePath, mediaFile.buffer);
      cliArgs.push("--source-file", tempFilePath);
    }
    if (command.assignedTo) {
      cliArgs.push("--assigned-to", command.assignedTo);
    }
    const output = execNpmScript("import-tasks-from-excel", cliArgs);
    const result = parseJsonInput(output, "npm run import-tasks-from-excel") as JsonObject;
    return {
      ...result,
      ok: result.ok === undefined ? true : result.ok,
      userid,
      intent: "import-tasks-from-excel",
      route_script: "import-tasks-from-excel",
      route_args: {
        sourceUrl: command.sourceUrl,
        mediaId: attachment?.mediaId,
        filename: attachment?.filename,
        execution: command.execution,
        assignedTo: command.assignedTo,
      },
      reply_text:
        typeof result.reply_text === "string" && result.reply_text.trim()
          ? result.reply_text
          : "批量导入任务执行完成。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      userid,
      intent: "import-tasks-from-excel",
      route_script: "import-tasks-from-excel",
      error: message,
      reply_text: `已识别为批量导入任务请求，但执行失败：${message}`,
    };
  } finally {
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup failure for temp import file
      }
    }
  }
}

async function dispatchRoute(match: RouteMatch, text: string, userid: string, payload: CallbackPayload, values: Record<string, string | boolean | undefined>, resolvedArgs?: Record<string, string>): Promise<JsonObject> {
  const { route } = match;
  const sourceType = detectWecomMessageSource(payload);

  const args = resolvedArgs ?? extractRouteArgs(text, route, userid);
  const missingArgs = collectMissingArgs(route, args);
  if (missingArgs.length > 0) {
    return {
      ok: true,
      userid,
      message_source: sourceType,
      intent: route.intent,
      matched_by: match.trigger,
      route_script: route.script,
      route_args: args,
      missing_args: missingArgs,
      reply_text: buildMissingArgsReply(route, missingArgs),
    };
  }

  const scriptResult = runScript(route, args);
  return {
    ...scriptResult,
    ok: scriptResult.ok === undefined ? true : scriptResult.ok,
    userid,
    message_source: sourceType,
    intent: route.intent,
    matched_by: match.trigger,
    route_script: route.script,
    route_args: args,
    reply_text: scriptResult.ok === false
      ? buildScriptErrorReply(route, scriptResult)
      : buildScriptResultReply(route, scriptResult, userid, sourceType, args),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      data: { type: "string" },
      "data-file": { type: "string" },
      "reply-format": { type: "string" },
      status: { type: "string", default: "all" },
      limit: { type: "string" },
      "page-size": { type: "string" },
      "max-lines": { type: "string", default: "10" },
      "sync-user": { type: "boolean", default: true },
    },
    allowPositionals: false,
  });

  const payload = (values["data-file"]
    ? parseJsonInput(readFileSync(values["data-file"], "utf8"), values["data-file"])
    : values.data
      ? parseJsonInput(values.data, "--data")
      : {}) as CallbackPayload;
  const replyFormat = normalizeReplyFormat(
    (values["reply-format"] as string | undefined)
      ?? payload.reply_format
      ?? process.env.WECOM_CALLBACK_REPLY_FORMAT,
  );

  const userid = values.userid ?? extractUserid(payload);
  const text = extractText(payload);
  const routes = loadIntentRoutes();
  const sourceType = detectWecomMessageSource(payload);

  if (isContactSyncPayload(payload)) {
    const result = await handleContactSyncPayload(payload);
    printJson(maybeWrapReplyAsTemplateCard({
      ...result,
      message_source: sourceType,
    }, replyFormat, userid ?? "unknown"));
    return;
  }

  if (!userid) {
    throw new Error("Cannot determine WeCom userid from callback payload.");
  }

  if (isImportTaskRequest(text, payload)) {
    const result = await dispatchImportTask(text, userid, payload);
    printJson(maybeWrapReplyAsTemplateCard({
      ...result,
      message_source: sourceType,
      route_source: "wecom_import_special",
    }, replyFormat, userid));
    return;
  }

  const valuesRecord = values as Record<string, string | boolean | undefined>;
  const match = findRouteMatch(text, routes);
  if (match) {
    const result = await dispatchRoute(match, text, userid, payload, valuesRecord);
    printJson(maybeWrapReplyAsTemplateCard({
      ...result,
      message_source: sourceType,
      route_source: "yaml",
    }, replyFormat, userid));
    return;
  }

  const llmDecision = await classifyWecomIntentWithLlm({
    text,
    userid,
    routes,
  });

  if (llmDecision?.is_zentao_request && typeof llmDecision.intent === "string" && llmDecision.intent.trim()) {
    const route = findRouteByIntent(llmDecision.intent, routes);
    if (route) {
      const llmArgs = normalizeRouteArgs(llmDecision.args as JsonObject | undefined);
      const mergedArgs = {
        ...extractRouteArgs(text, route, userid),
        ...llmArgs,
      };
      const result = await dispatchRoute({ route, trigger: "llm" }, text, userid, payload, valuesRecord, mergedArgs);
      printJson(maybeWrapReplyAsTemplateCard({
        ...result,
        message_source: sourceType,
        route_source: "llm",
        llm_decision: llmDecision satisfies LlmIntentDecision,
      }, replyFormat, userid));
      return;
    }
  }

  printJson(maybeWrapReplyAsTemplateCard({
    ok: true,
    userid,
    message_source: sourceType,
    intent: "non_zentao_or_unknown",
    input_text: text,
    reply_text: buildRouteHelpText(routes),
    should_fallback_to_general_ai: true,
    route_source: llmDecision ? "llm_non_zentao" : "yaml_miss",
    llm_decision: llmDecision,
  }, replyFormat, userid));
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

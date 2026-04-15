import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
  isDocxAttachmentPayload,
  parseJsonInput,
  type WecomMessagePayload,
} from "../shared/wecom_payload";
import { classifyWecomIntentWithLlm, type LlmIntentDecision } from "./llm_intent_router";
import { buildMissingArgsReply, buildRouteHelpText, buildScriptErrorReply, buildScriptResultReply } from "./wecom_reply_formatter";
import { collectMissingArgs, extractRouteArgs, findRouteByIntent, findRouteMatch, loadIntentRoutes, normalizeRouteArgs, type IntentRoute, type RouteMatch } from "./wecom_route_resolver";
import { findContextualSemanticRoute } from "./wecom_context_semantic_resolver";
import { resolveNamedEntityArgs, resolveNamedProductArg } from "./wecom_named_entity_resolution";
import { buildPendingRouteSelectionPrompt, buildRouteSelectionReply, parseRouteSelectionIndex } from "./wecom_route_selection";
import { WecomClient } from "../shared/wecom_client";
import { dispatchInteractiveCallback } from "./wecom_interactive_dispatcher";
import { appendRecentWecomMessage, listRecentWecomMessages, type WecomRecentMessageRecord } from "../shared/wecom_recent_message_window";
import { clearPendingWecomOperation, loadPendingWecomOperation, savePendingWecomOperation } from "../shared/wecom_pending_operation_store";
import {
  buildWecomContextualMissingHint,
  getWecomContextualCandidateSuggestions,
  resolveRouteArgsFromWecomContext,
  saveWecomSessionContextFromResult,
} from "../shared/wecom_session_context_store";
import { clearPendingRouteSelection, loadPendingRouteSelection } from "../shared/wecom_pending_route_store";

interface CallbackPayload extends JsonObject {
  content?: string;
  text?: string;
  msgtype?: string;
  MsgType?: string;
  reply_format?: string;
  route_args?: JsonValue;
  body?: JsonValue;
}

interface ResolvedAttachmentInfo {
  mediaId: string;
  filename?: string;
}

interface AttachmentIntentCandidate {
  intent: "requirement-to-testcase" | "import-tasks-from-excel";
  attachments: ResolvedAttachmentInfo[];
}

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const IMPORT_TASK_TRIGGERS = [
  "导入任务",
  "批量导入任务",
  "excel导入任务",
  "导任务",
];

const REQUIREMENT_TO_TESTCASE_TRIGGERS = [
  "生成测试用例",
  "根据需求写测试用例",
  "需求转测试用例",
  "导出测试用例",
  "根据文档生成测试用例",
  "测试案例",
];

const SHORT_REQUIREMENT_COMMAND_HINTS = [
  "生成测试用例",
  "分析此需求文档生成测试用例",
  "根据文档生成测试用例",
  "导出测试用例",
  "需求转测试用例",
  "测试案例",
];

interface ImportTaskCommand {
  sourceUrl?: string;
  execution?: string;
  assignedTo?: string;
}

interface RequirementToTestcaseCommand {
  format: "excel" | "xmind" | "both";
}

interface NpmRunner {
  command: string;
  baseArgs: string[];
  displayName: string;
}

interface RouteRepairResult {
  match: RouteMatch;
  args: Record<string, string>;
}

const EXACT_MISSING_ARG_FALLBACKS: Record<string, string> = {
  "query-product-modules": "query-products",
  "query-product-stories": "query-my-stories",
};
const PRESET_REPLIES: Array<{ id: string; triggers: string[]; reply: string }> = [
  {
    id: "intro",
    triggers: ["你是谁", "介绍一下你", "你是干嘛的"],
    reply: "我是 AI-PMO，负责项目协同、禅道查询和轻量问答支持。你可以直接问我禅道相关问题，或者先发送“帮助”查看常用指令。",
  },
  {
    id: "help",
    triggers: ["帮助", "help", "你会什么", "支持哪些命令"],
    reply: "常用指令包括：我的bug、我的任务、查询我的bug、查任务、创建Bug、创建任务、上线检查。普通开放问答会优先走轻量快答链路。",
  },
  {
    id: "how_create_bug",
    triggers: ["怎么提bug", "如何提bug", "怎么创建bug"],
    reply: "你可以直接发送：创建Bug 标题xxx 描述xxx。如果需要，我也可以继续帮你补优先级、所属模块和指派人。",
  },
  {
    id: "how_query_task",
    triggers: ["怎么查任务", "如何查任务", "怎么查询任务"],
    reply: "你可以直接发送：我的任务、查任务，或者看下我的任务。若要查详情，也可以发：任务详情 {id}。",
  },
];
const ZENTAO_BUSINESS_KEYWORDS = [
  "bug",
  "缺陷",
  "任务",
  "需求",
  "测试",
  "产品",
  "项目",
  "执行",
  "迭代",
  "发布",
  "上线",
  "验收",
  "指派",
  "创建",
  "提测",
  "准出",
];
const OPEN_QUESTION_HINTS = [
  "什么",
  "怎么",
  "如何",
  "为什么",
  "谁",
  "哪",
  "可以吗",
  "能不能",
  "帮我看",
  "看下",
  "看一下",
  "解释",
  "介绍",
];

function normalizeReplyFormat(value: string | undefined): "text" | "template_card" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "template_card" || normalized === "card") {
    return "template_card";
  }
  return "text";
}

function normalizeWecomText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/@\S+/gu, " ")
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’`~\-_/\\|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function findPresetReply(text: string): { id: string; matchedBy: string; reply: string; normalizedText: string } | null {
  const normalized = normalizeWecomText(text);
  if (!normalized) {
    return null;
  }

  if (ZENTAO_BUSINESS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return null;
  }

  let best: { id: string; matchedBy: string; reply: string; normalizedText: string } | null = null;
  for (const rule of PRESET_REPLIES) {
    for (const trigger of rule.triggers) {
      const normalizedTrigger = normalizeWecomText(trigger);
      if (!normalizedTrigger) {
        continue;
      }
      if (normalized.includes(normalizedTrigger)) {
        if (!best || normalizedTrigger.length > best.matchedBy.length) {
          best = {
            id: rule.id,
            matchedBy: normalizedTrigger,
            reply: rule.reply,
            normalizedText: normalized,
          };
        }
      }
    }
  }

  return best;
}

function shouldPreferFastGeneralAi(text: string): boolean {
  const normalized = normalizeWecomText(text);
  if (!normalized) {
    return false;
  }

  if (ZENTAO_BUSINESS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  return normalized.length <= 24 && OPEN_QUESTION_HINTS.some((hint) => normalized.includes(hint));
}

function shouldBypassZentaoLlm(text: string): boolean {
  const normalized = normalizeWecomText(text);
  if (!normalized || normalized.length > 12) {
    return false;
  }

  if (shouldPreferFastGeneralAi(normalized)) {
    return true;
  }

  if (ZENTAO_BUSINESS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  if (/^\d+$/u.test(normalized)) {
    return true;
  }

  if (/^[a-z]+$/iu.test(normalized) && normalized.length <= 6) {
    return true;
  }

  if (/^[\u4e00-\u9fa5]+$/u.test(normalized) && normalized.length <= 6) {
    const uniqueChars = new Set(normalized.split(""));
    return uniqueChars.size >= Math.max(2, normalized.length - 1);
  }

  return false;
}

function buildGeneralAiAckPayload(text: string): { ackText: string; estimatedSeconds: number } {
  if (shouldPreferFastGeneralAi(text)) {
    return {
      ackText: "收到，正在快速帮你看，预计 8 到 15 秒。",
      estimatedSeconds: 15,
    };
  }

  return {
    ackText: "收到，正在处理中，预计 15 到 30 秒。",
    estimatedSeconds: 30,
  };
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
    sub_title_text: truncateText(currentReplyText, 1200),
    card_action: {
      type: 1,
      url: "https://work.weixin.qq.com/",
    },
  };

  return {
    ...result,
    reply_text: JSON.stringify({ template_card: templateCard }),
    reply_format: "template_card",
  } satisfies JsonObject;
}

function getRouteCliExtraKeys(route: IntentRoute): string[] {
  switch (route.intent) {
    case "link-execution-stories":
      return ["story-ids"];
    case "link-release-items":
      return ["story-ids", "bug-ids"];
    case "link-testtask-cases":
      return ["cases"];
    default:
      return [];
  }
}

function normalizeRouteScriptArgs(route: IntentRoute, args: Record<string, string>): Record<string, string> {
  const normalized = { ...args };

  if (route.intent === "link-execution-stories" && !normalized["story-ids"] && normalized.story) {
    normalized["story-ids"] = normalized.story;
  }
  if (route.intent === "link-release-items") {
    if (!normalized["story-ids"] && normalized.story) {
      normalized["story-ids"] = normalized.story;
    }
    if (!normalized["bug-ids"] && normalized.bug) {
      normalized["bug-ids"] = normalized.bug;
    }
  }
  if (route.intent === "link-testtask-cases" && !normalized.cases && normalized.case) {
    normalized.cases = normalized.case;
  }

  return normalized;
}

function toCliArgs(route: IntentRoute, args: Record<string, string>): string[] {
  const allowedKeys = new Set<string>([
    "userid",
    ...route.requiredArgs,
    ...route.requiredArgsAny,
    ...route.optionalArgs,
    ...Object.keys(route.defaultArgs),
    ...getRouteCliExtraKeys(route),
  ]);
  const routeArgs = normalizeRouteScriptArgs(route, args);
  const normalized: Record<string, string> = {};
  const fallbackUserid = typeof routeArgs.userid === "string" && routeArgs.userid.trim() && routeArgs.userid.trim() !== "current_user"
    ? routeArgs.userid.trim()
    : "";

  for (const [rawKey, rawValue] of Object.entries(routeArgs)) {
    const key = rawKey.trim();
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !value || key === "current_user") {
      continue;
    }

    const normalizedKey = key === "user_id" ? "userid" : key;
    if (!allowedKeys.has(normalizedKey)) {
      continue;
    }
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

  const entries = Object.entries(normalized);
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
    const output = execNpmScript(route.script, toCliArgs(route, args));
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

function isRequirementToTestcaseRequest(text: string, payload: WecomMessagePayload): boolean {
  if (REQUIREMENT_TO_TESTCASE_TRIGGERS.some((trigger) => text.includes(trigger))) {
    return true;
  }

  return isDocxAttachmentPayload(payload);
}

function extractRequirementToTestcaseCommand(text: string): RequirementToTestcaseCommand {
  const normalized = text.toLowerCase();
  const wantsXmind = normalized.includes("xmind") || text.includes("脑图");
  const wantsExcel = normalized.includes("excel") || normalized.includes("xlsx") || text.includes("表格");
  return {
    format: wantsXmind && wantsExcel ? "both" : wantsXmind ? "xmind" : "excel",
  };
}

function isShortRequirementCommandWithoutDocument(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  if (normalized.length > 30) {
    return false;
  }

  return SHORT_REQUIREMENT_COMMAND_HINTS.some((hint) => {
    const normalizedHint = hint
      .trim()
      .toLowerCase()
      .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    return normalized === normalizedHint;
  });
}

function isImportTaskRequest(text: string, payload: WecomMessagePayload): boolean {
  if (IMPORT_TASK_TRIGGERS.some((trigger) => text.includes(trigger))) {
    return true;
  }

  return extractAttachmentInfo(payload) !== null;
}

function isRequirementIntentText(text: string): boolean {
  return REQUIREMENT_TO_TESTCASE_TRIGGERS.some((trigger) => text.includes(trigger));
}

function isImportIntentText(text: string): boolean {
  return IMPORT_TASK_TRIGGERS.some((trigger) => text.includes(trigger));
}

function isExcelLikeAttachment(filename: string | undefined): boolean {
  const normalized = String(filename ?? "").trim().toLowerCase();
  return normalized.endsWith(".xlsx") || normalized.endsWith(".xls") || normalized.endsWith(".csv");
}

function getRouteAttachment(payload: WecomMessagePayload): ResolvedAttachmentInfo | null {
  const routeArgs = payload.route_args && typeof payload.route_args === "object" && !Array.isArray(payload.route_args)
    ? payload.route_args as Record<string, unknown>
    : undefined;
  if (!routeArgs || typeof routeArgs.mediaId !== "string" || !routeArgs.mediaId.trim()) {
    return null;
  }
  return {
    mediaId: routeArgs.mediaId.trim(),
    filename: typeof routeArgs.filename === "string" ? routeArgs.filename.trim() : undefined,
  };
}

function buildAttachmentAwarePayload(payload: WecomMessagePayload, attachment: ResolvedAttachmentInfo): CallbackPayload {
  return {
    ...payload,
    route_args: {
      ...(payload.route_args && typeof payload.route_args === "object" && !Array.isArray(payload.route_args)
        ? payload.route_args as Record<string, unknown>
        : {}),
      mediaId: attachment.mediaId,
      filename: attachment.filename,
    },
  } satisfies CallbackPayload;
}

function collectCandidateAttachments(records: WecomRecentMessageRecord[], intent: AttachmentIntentCandidate["intent"]): ResolvedAttachmentInfo[] {
  const filtered = records
    .filter((record) => record.type === "file" && record.attachment?.mediaId)
    .map((record) => record.attachment as ResolvedAttachmentInfo)
    .filter((attachment) => intent === "requirement-to-testcase"
      ? String(attachment.filename ?? "").trim().toLowerCase().endsWith(".docx")
      : isExcelLikeAttachment(attachment.filename));

  const seen = new Set<string>();
  return filtered.filter((attachment) => {
    if (seen.has(attachment.mediaId)) {
      return false;
    }
    seen.add(attachment.mediaId);
    return true;
  });
}

function resolveAttachmentIntentCandidate(userid: string, text: string): AttachmentIntentCandidate | null {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return null;
  }

  const recentMessages = listRecentWecomMessages(userid);
  if (recentMessages.length === 0) {
    return null;
  }

  if (isRequirementIntentText(trimmedText)) {
    const attachments = collectCandidateAttachments(recentMessages, "requirement-to-testcase");
    return attachments.length > 0 ? { intent: "requirement-to-testcase", attachments } : null;
  }

  if (isImportIntentText(trimmedText)) {
    const attachments = collectCandidateAttachments(recentMessages, "import-tasks-from-excel");
    return attachments.length > 0 ? { intent: "import-tasks-from-excel", attachments } : null;
  }

  return null;
}

function buildPendingConfirmationReply(operationText: string, attachment: ResolvedAttachmentInfo): string {
  return [
    "已收到附件：",
    `1. ${attachment.filename ?? attachment.mediaId}`,
    "",
    `你刚才的指令是：${operationText}`,
    "请回复以下任一内容继续：",
    "- 确认",
    "- 取消",
    "- 改为生成xmind",
  ].join("\n");
}

function buildPendingSelectionReply(operationText: string, attachments: ResolvedAttachmentInfo[]): string {
  return [
    "已收到多个附件，请确认要处理哪个文件：",
    ...attachments.map((attachment, index) => `${index + 1}. ${attachment.filename ?? attachment.mediaId}`),
    "",
    `你刚才的指令是：${operationText}`,
    "请回复：",
    ...attachments.map((_, index) => `- 处理第${index + 1}个`),
    "- 取消",
  ].join("\n");
}

async function resolvePendingRouteSelectionReply(
  text: string,
  userid: string,
  payload: CallbackPayload,
  values: Record<string, string | boolean | undefined>,
  routes: IntentRoute[],
): Promise<JsonObject | null> {
  const pending = loadPendingRouteSelection(userid);
  if (!pending) {
    return null;
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    clearPendingRouteSelection(userid);
    return {
      ok: true,
      userid,
      intent: pending.routeIntent,
      reply_text: "上一条待确认的候选对象已过期，请重新发起一次查询或操作。",
    } satisfies JsonObject;
  }

  if (isCancelReply(trimmedText)) {
    clearPendingRouteSelection(userid);
    return {
      ok: true,
      userid,
      intent: pending.routeIntent,
      reply_text: "已取消这次候选对象确认。",
    } satisfies JsonObject;
  }

  const selectedIndex = parseRouteSelectionIndex(trimmedText, pending.entity, pending.candidates.length);
  if (selectedIndex === null) {
    return {
      ok: true,
      userid,
      intent: pending.routeIntent,
      pending_route_selection: true,
      reply_text: buildPendingRouteSelectionPrompt(pending.entity, pending.candidates),
    } satisfies JsonObject;
  }

  const route = findRouteByIntent(pending.routeIntent, routes);
  if (!route) {
    clearPendingRouteSelection(userid);
    return {
      ok: false,
      userid,
      intent: pending.routeIntent,
      reply_text: "待继续的禅道路由已失效，请重新发送原始需求。",
    } satisfies JsonObject;
  }

  const selectedCandidate = pending.candidates[selectedIndex];
  clearPendingRouteSelection(userid);
  return dispatchRoute(
    { route, trigger: pending.routeTrigger ?? "pending-selection" },
    pending.originalText,
    userid,
    payload,
    values,
    {
      ...pending.args,
      [pending.entity]: selectedCandidate.id,
    },
  );
}

function buildPendingExpiredReply(): JsonObject {
  return {
    ok: true,
    reply_text: "上一条待确认的附件操作已过期，请重新发送附件和处理指令。",
  } satisfies JsonObject;
}

function parsePendingSelection(text: string, maxCount: number): number | null {
  const normalized = text.trim();
  const match = normalized.match(/第\s*(\d+)\s*个/u) ?? normalized.match(/处理\s*(\d+)/u);
  if (!match?.[1]) {
    return null;
  }
  const index = Number.parseInt(match[1], 10);
  if (!Number.isFinite(index) || index < 1 || index > maxCount) {
    return null;
  }
  return index - 1;
}

function isConfirmReply(text: string): boolean {
  const normalized = text.trim();
  return ["确认", "好的", "开始", "继续"].includes(normalized);
}

function isCancelReply(text: string): boolean {
  const normalized = text.trim();
  return ["取消", "不用了", "结束"].includes(normalized);
}

async function resolvePendingOperationReply(text: string, userid: string, payload: CallbackPayload): Promise<JsonObject | null> {
  const pending = loadPendingWecomOperation(userid);
  if (!pending) {
    return null;
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    clearPendingWecomOperation(userid);
    return buildPendingExpiredReply();
  }

  if (isCancelReply(trimmedText)) {
    clearPendingWecomOperation(userid);
    return {
      ok: true,
      userid,
      intent: pending.intent,
      reply_text: "已取消本次附件处理请求。",
    } satisfies JsonObject;
  }

  if (pending.status === "awaiting_confirmation") {
    if (!isConfirmReply(trimmedText) && !trimmedText.includes("xmind")) {
      return {
        ok: true,
        userid,
        intent: pending.intent,
        reply_text: buildPendingConfirmationReply(pending.originalText, pending.attachments[0]),
      } satisfies JsonObject;
    }

    clearPendingWecomOperation(userid);
    const attachment = pending.attachments[0];
    const effectiveText = trimmedText.includes("xmind") ? trimmedText : pending.originalText;
    const nextPayload = buildAttachmentAwarePayload(payload, attachment);
    return pending.intent === "requirement-to-testcase"
      ? dispatchRequirementToTestcase(effectiveText, userid, nextPayload)
      : dispatchImportTask(effectiveText, userid, nextPayload);
  }

  const selectedIndex = parsePendingSelection(trimmedText, pending.attachments.length);
  if (selectedIndex === null) {
    return {
      ok: true,
      userid,
      intent: pending.intent,
      reply_text: buildPendingSelectionReply(pending.originalText, pending.attachments),
    } satisfies JsonObject;
  }

  clearPendingWecomOperation(userid);
  const attachment = pending.attachments[selectedIndex];
  const nextPayload = buildAttachmentAwarePayload(payload, attachment);
  return pending.intent === "requirement-to-testcase"
    ? dispatchRequirementToTestcase(pending.originalText, userid, nextPayload)
    : dispatchImportTask(pending.originalText, userid, nextPayload);
}

function buildAttachmentIntentReply(userid: string, text: string): JsonObject | null {
  const candidate = resolveAttachmentIntentCandidate(userid, text);
  if (!candidate) {
    return null;
  }

  const status = candidate.attachments.length === 1 ? "awaiting_confirmation" : "awaiting_selection";
  savePendingWecomOperation({
    userid,
    intent: candidate.intent,
    originalText: text.trim(),
    attachments: candidate.attachments,
    status,
  });

  return {
    ok: true,
    userid,
    intent: candidate.intent,
    pending_operation: status,
    reply_text: candidate.attachments.length === 1
      ? buildPendingConfirmationReply(text.trim(), candidate.attachments[0])
      : buildPendingSelectionReply(text.trim(), candidate.attachments),
  } satisfies JsonObject;
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
  const attachment = extractAttachmentInfo(payload) ?? getRouteAttachment(payload);
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

async function dispatchRequirementToTestcase(text: string, userid: string, payload: WecomMessagePayload): Promise<JsonObject> {
  const command = extractRequirementToTestcaseCommand(text);
  const attachment = extractAttachmentInfo(payload) ?? getRouteAttachment(payload);
  const trimmedText = text.trim();

  if (!attachment && !trimmedText) {
    return {
      ok: true,
      userid,
      intent: "requirement-to-testcase",
      missing_args: [".docx 附件或需求文本"],
      reply_text: [
        "已识别为需求转测试用例请求。",
        "请发送 .docx 需求文档，或直接粘贴需求文本后重试。",
        "示例：上传 .docx 后发送“生成测试用例并导出excel”",
      ].join("\n"),
    };
  }

  if (!attachment && isShortRequirementCommandWithoutDocument(trimmedText)) {
    return {
      ok: true,
      userid,
      intent: "requirement-to-testcase",
      missing_args: [".docx 附件或需求正文"],
      reply_text: [
        "已识别为需求转测试用例请求，但当前未检测到可读取的 .docx 附件内容。",
        "请重新上传需求文档后重试，或直接粘贴需求正文。",
        "仅发送“生成测试用例”这类短指令时，系统不会再把指令本身当成需求正文处理。",
      ].join("\n"),
    };
  }

  let tempFilePath: string | null = null;
  try {
    const cliArgs = [
      "--callback-mode",
      "--source-type",
      detectWecomMessageSource(payload),
      "--format",
      command.format,
    ];

    if (attachment) {
      if (!attachment.filename || !attachment.filename.trim().toLowerCase().endsWith(".docx")) {
        return {
          ok: true,
          userid,
          intent: "requirement-to-testcase",
          reply_text: "当前仅支持通过企业微信自建应用上传 .docx 需求文档。",
        };
      }

      const wecomClient = new WecomClient();
      const mediaFile = await wecomClient.downloadMedia(attachment.mediaId, attachment.filename);
      const filename = sanitizeFilename(mediaFile.filename || `${attachment.mediaId}.docx`);
      tempFilePath = path.join(tmpdir(), `openclaw-zentao-requirement-${Date.now()}-${filename}`);
      writeFileSync(tempFilePath, mediaFile.buffer);
      
      // 验证临时文件是否创建成功
      if (!existsSync(tempFilePath)) {
        throw new Error(`临时文件创建失败：${tempFilePath}`);
      }
      const tempStats = statSync(tempFilePath);
      if (tempStats.size === 0) {
        throw new Error(`临时文件为空：${tempFilePath}`);
      }

      cliArgs.push("--input-file", tempFilePath);
    } else {
      cliArgs.push("--input-text", trimmedText);
    }

    const output = execNpmScript("requirement-to-testcase", cliArgs);
    const result = parseJsonInput(output, "npm run requirement-to-testcase") as JsonObject;
    const outputFiles = Array.isArray(result.output_files)
      ? result.output_files.map((item) => String(item)).filter(Boolean)
      : [];

    if (outputFiles.length > 0) {
      const wecomClient = new WecomClient();
      for (const filePath of outputFiles) {
        const uploaded = await wecomClient.uploadTemporaryMedia(filePath);
        await wecomClient.sendFileToUsers([userid], uploaded.media_id);
      }
    }

    return {
      ...result,
      ok: result.ok === undefined ? true : result.ok,
      userid,
      intent: "requirement-to-testcase",
      route_script: "requirement-to-testcase",
      route_args: {
        format: command.format,
        mediaId: attachment?.mediaId,
        filename: attachment?.filename,
      },
      reply_text:
        typeof result.reply_text === "string" && result.reply_text.trim()
          ? result.reply_text
          : "需求转测试用例执行完成。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      userid,
      intent: "requirement-to-testcase",
      route_script: "requirement-to-testcase",
      error: message,
      reply_text: `已识别为需求转测试用例请求，但执行失败：${message}`,
    };
  } finally {
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup failure for temp requirement file
      }
    }
  }
}

async function dispatchRoute(match: RouteMatch, text: string, userid: string, payload: CallbackPayload, values: Record<string, string | boolean | undefined>, resolvedArgs?: Record<string, string>): Promise<JsonObject> {
  const { route } = match;
  const sourceType = detectWecomMessageSource(payload);

  const rawArgs = resolveRouteArgsFromWecomContext({
    userid,
    text,
    intent: route.intent,
    requiredArgs: route.requiredArgs,
    requiredArgsAny: route.requiredArgsAny,
    args: resolvedArgs ?? extractRouteArgs(text, route, userid),
  });
  const productResolved = await resolveNamedProductArg(route, text, userid, rawArgs);
  if (productResolved.reply) {
    return {
      ...productResolved.reply,
      message_source: sourceType,
      matched_by: match.trigger,
    };
  }

  const entityResolved = await resolveNamedEntityArgs(route, text, userid, productResolved.args);
  if (entityResolved.reply) {
    return {
      ...entityResolved.reply,
      message_source: sourceType,
      matched_by: match.trigger,
    };
  }

  const args = normalizeRouteScriptArgs(route, entityResolved.args);
  const missingArgs = collectMissingArgs(route, args);
  if (missingArgs.length > 0) {
    const contextualHint = buildWecomContextualMissingHint({
      userid,
      requiredArgsAny: route.requiredArgsAny,
      missingArgs,
    });
    const contextualSuggestions = getWecomContextualCandidateSuggestions({
      userid,
      requiredArgsAny: route.requiredArgsAny,
      missingArgs,
    });
    if (contextualSuggestions.length > 0) {
      const primarySuggestion = contextualSuggestions[0];
      return {
        ...buildRouteSelectionReply({
          userid,
          route,
          trigger: match.trigger,
          originalText: text,
          args,
          entity: primarySuggestion.entity,
          candidates: primarySuggestion.candidates,
          intro: `我先把最近相关的${primarySuggestion.label}列出来，你回复编号后我继续执行刚才的操作：`,
        }),
        message_source: sourceType,
        matched_by: match.trigger,
      };
    }
    return {
      ok: true,
      userid,
      message_source: sourceType,
      intent: route.intent,
      matched_by: match.trigger,
      route_script: route.script,
      route_args: args,
      missing_args: missingArgs,
      reply_text: contextualHint
        ? `${buildMissingArgsReply(route, missingArgs)}\n${contextualHint}`
        : buildMissingArgsReply(route, missingArgs),
    };
  }

  const scriptResult = runScript(route, args);
  const result = {
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

  if (result.ok !== false) {
    saveWecomSessionContextFromResult({
      userid,
      text,
      intent: route.intent,
      args,
      result,
    });
  }

  return result;
}

function normalizeFallbackTriggerText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[，。！？,.!?:：；;()\[\]{}]/gu, " ")
    .replace(/\s+/gu, "")
    .trim();
}

function resolveExactMissingArgFallback(input: {
  match: RouteMatch;
  text: string;
  args: Record<string, string>;
  routes: IntentRoute[];
  userid: string;
}): RouteRepairResult | null {
  const fallbackIntent = EXACT_MISSING_ARG_FALLBACKS[input.match.route.intent];
  if (!fallbackIntent) {
    return null;
  }

  const normalizedText = normalizeFallbackTriggerText(input.text);
  const normalizedTrigger = normalizeFallbackTriggerText(input.match.trigger ?? "");
  if (!normalizedText || !normalizedTrigger || normalizedText !== normalizedTrigger) {
    return null;
  }

  const fallbackRoute = findRouteByIntent(fallbackIntent, input.routes);
  if (!fallbackRoute) {
    return null;
  }

  return {
    match: { route: fallbackRoute, trigger: `fallback-${fallbackIntent}` },
    args: extractRouteArgs(input.text, fallbackRoute, input.userid),
  };
}

function resolveRouteArgsWithLlmRepair(input: {
  text: string;
  userid: string;
  routes: IntentRoute[];
  match: RouteMatch;
  llmDecision: LlmIntentDecision | null;
}): RouteRepairResult | null {
  const baseArgs = resolveRouteArgsFromWecomContext({
    userid: input.userid,
    text: input.text,
    intent: input.match.route.intent,
    requiredArgs: input.match.route.requiredArgs,
    requiredArgsAny: input.match.route.requiredArgsAny,
    args: extractRouteArgs(input.text, input.match.route, input.userid),
  });
  const baseMissingArgs = collectMissingArgs(input.match.route, baseArgs);
  if (baseMissingArgs.length === 0) {
    return {
      match: input.match,
      args: baseArgs,
    };
  }

  if (!input.llmDecision?.is_zentao_request) {
    const fallback = resolveExactMissingArgFallback({
      match: input.match,
      text: input.text,
      args: baseArgs,
      routes: input.routes,
      userid: input.userid,
    });
    if (fallback) {
      return fallback;
    }
    return null;
  }

  const llmArgs = normalizeRouteArgs(input.llmDecision.args as JsonObject | undefined);
  const candidateRoute = typeof input.llmDecision.intent === "string" && input.llmDecision.intent.trim()
    ? findRouteByIntent(input.llmDecision.intent, input.routes) ?? input.match.route
    : input.match.route;
  const candidateMatch: RouteMatch = {
    route: candidateRoute,
    trigger: input.llmDecision.intent === candidateRoute.intent ? "llm-repair" : input.match.trigger,
  };
  const candidateArgs = resolveRouteArgsFromWecomContext({
    userid: input.userid,
    text: input.text,
    intent: candidateRoute.intent,
    requiredArgs: candidateRoute.requiredArgs,
    requiredArgsAny: candidateRoute.requiredArgsAny,
    args: {
      ...extractRouteArgs(input.text, candidateRoute, input.userid),
      ...llmArgs,
    },
  });
  const candidateMissingArgs = collectMissingArgs(candidateRoute, candidateArgs);

  if (candidateMissingArgs.length >= baseMissingArgs.length) {
    const fallback = resolveExactMissingArgFallback({
      match: input.match,
      text: input.text,
      args: baseArgs,
      routes: input.routes,
      userid: input.userid,
    });
    if (fallback) {
      return fallback;
    }
    return null;
  }

  return {
    match: candidateMatch,
    args: candidateArgs,
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

  const interactiveResult = await dispatchInteractiveCallback(payload, userid);
  if (interactiveResult) {
    printJson(maybeWrapReplyAsTemplateCard(interactiveResult, replyFormat, userid));
    return;
  }

  const inboundAttachment = extractAttachmentInfo(payload);
  if (inboundAttachment) {
    appendRecentWecomMessage({
      userid,
      type: "file",
      attachment: inboundAttachment,
    });
  }
  if (text.trim()) {
    appendRecentWecomMessage({
      userid,
      type: "text",
      text: text.trim(),
    });
  }

  const presetReply = findPresetReply(text);
  if (presetReply) {
    printJson(maybeWrapReplyAsTemplateCard({
      ok: true,
      userid,
      message_source: sourceType,
      intent: "wecom_preset_reply",
      preset_id: presetReply.id,
      matched_by: presetReply.matchedBy,
      input_text: text,
      normalized_text: presetReply.normalizedText,
      reply_text: presetReply.reply,
      route_source: "preset",
    }, replyFormat, userid));
    return;
  }


  const attachmentIntentReply = buildAttachmentIntentReply(userid, text);
  if (attachmentIntentReply) {
    printJson(maybeWrapReplyAsTemplateCard({
      ...attachmentIntentReply,
      message_source: sourceType,
      route_source: "wecom_attachment_window",
    }, replyFormat, userid));
    return;
  }

  if (isRequirementToTestcaseRequest(text, payload)) {
    const result = await dispatchRequirementToTestcase(text, userid, payload);
    printJson(maybeWrapReplyAsTemplateCard({
      ...result,
      message_source: sourceType,
      route_source: "wecom_requirement_special",
    }, replyFormat, userid));
    return;
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
  const pendingRouteReply = await resolvePendingRouteSelectionReply(text, userid, payload, valuesRecord, routes);
  if (pendingRouteReply) {
    printJson(maybeWrapReplyAsTemplateCard({
      ...pendingRouteReply,
      message_source: sourceType,
      route_source: "pending_route_selection",
    }, replyFormat, userid));
    return;
  }

  if (shouldBypassZentaoLlm(text)) {
    const generalAiAck = buildGeneralAiAckPayload(text);
    printJson(maybeWrapReplyAsTemplateCard({
      ok: true,
      userid,
      message_source: sourceType,
      intent: "non_zentao_or_unknown",
      input_text: text,
      reply_text: buildRouteHelpText(routes),
      should_fallback_to_general_ai: true,
      fallback_ack_text: generalAiAck.ackText,
      fallback_estimated_seconds: generalAiAck.estimatedSeconds,
      preferred_general_agent: "fast-general-ai",
      skip_zentao_llm_classification: true,
      fallback_reason: "short_input_bypass",
      route_source: "short_input_bypass",
    }, replyFormat, userid));
    return;
  }

  let llmDecision: LlmIntentDecision | null = null;
  const semanticResolution = findContextualSemanticRoute(text, userid, routes);
  const match = semanticResolution?.match ?? findRouteMatch(text, routes);
  if (match) {
    const repaired = resolveRouteArgsWithLlmRepair({
      text,
      userid,
      routes,
      match,
      llmDecision: null,
    });
    let effectiveMatch = match;
    let effectiveArgs = repaired?.args ?? extractRouteArgs(text, match.route, userid);
    if (collectMissingArgs(match.route, effectiveArgs).length > 0) {
      llmDecision = await classifyWecomIntentWithLlm({
        text,
        userid,
        routes,
      });
      const llmRepaired = resolveRouteArgsWithLlmRepair({
        text,
        userid,
        routes,
        match,
        llmDecision,
      });
      if (llmRepaired) {
        effectiveMatch = llmRepaired.match;
        effectiveArgs = llmRepaired.args;
      }
    }

    const result = await dispatchRoute(effectiveMatch, text, userid, payload, valuesRecord, effectiveArgs);
    printJson(maybeWrapReplyAsTemplateCard({
      ...result,
      message_source: sourceType,
      route_source: semanticResolution
        ? (llmDecision ? "semantic_llm_repair" : "semantic")
        : (llmDecision ? "yaml_llm_repair" : "yaml"),
      semantic_reason: semanticResolution?.reason,
      llm_decision: llmDecision ?? undefined,
    }, replyFormat, userid));
    return;
  }

  llmDecision = await classifyWecomIntentWithLlm({
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

  const generalAiAck = buildGeneralAiAckPayload(text);

  printJson(maybeWrapReplyAsTemplateCard({
    ok: true,
    userid,
    message_source: sourceType,
    intent: "non_zentao_or_unknown",
    input_text: text,
    reply_text: buildRouteHelpText(routes),
    should_fallback_to_general_ai: true,
    fallback_ack_text: generalAiAck.ackText,
    fallback_estimated_seconds: generalAiAck.estimatedSeconds,
    preferred_general_agent: shouldPreferFastGeneralAi(text) ? "fast-general-ai" : undefined,
    skip_zentao_llm_classification: shouldPreferFastGeneralAi(text) ? true : undefined,
    fallback_reason: shouldPreferFastGeneralAi(text) ? "open_question_non_zentao" : undefined,
    route_source: shouldPreferFastGeneralAi(text)
      ? "fast_general_open_question"
      : llmDecision ? "llm_non_zentao" : "yaml_miss",
    llm_decision: llmDecision,
  }, replyFormat, userid));
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

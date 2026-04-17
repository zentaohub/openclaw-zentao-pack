import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type JsonObject } from "../shared/zentao_client";
import { buildButtonInteractionCard } from "../replies/agent_templates/card_support";
import type { WecomMessageSource } from "../shared/wecom_payload";
import type { IntentRoute, RouteMatch } from "./wecom_route_resolver";
import { buildInteractiveActionKey, WECOM_INTERACTIVE_ACTIONS } from "./wecom_interactive_registry";
import {
  buildBugCreatePayload,
  buildFullTemplateText,
  buildMissingFieldsReply,
  buildRequiredTemplateText,
  collectMissingRequiredBugFields,
  looksLikeBugTemplate,
  mergeBugDraft,
  parseBugTemplate,
  parseBugTemplateFieldLine,
  type BugTemplateDraft,
} from "./bug_template_resolution";

export interface BugCreateFlowState {
  userid: string;
  stage: "collecting" | "confirming";
  draft: BugTemplateDraft;
  updatedAt: number;
}

interface ResolveBugCreateFlowInput {
  text: string;
  userid: string;
  sourceType: WecomMessageSource;
  routes: IntentRoute[];
  dispatchRoute: (match: RouteMatch, text: string, userid: string, resolvedArgs?: Record<string, string>) => Promise<JsonObject>;
}

interface BugCreateInteractiveExecutionResult {
  kind: "execute";
  routeArgs: Record<string, string>;
}

interface BugCreateInteractiveReplyResult {
  kind: "reply";
  result: JsonObject;
}

export type BugCreateInteractiveResolution =
  | BugCreateInteractiveExecutionResult
  | BugCreateInteractiveReplyResult;

const STORE_DIR = path.resolve(__dirname, "../../../tmp/wecom-bug-create-flow");
const EXPIRY_MS = 30 * 60 * 1000;

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function getStoreFile(userid: string): string {
  return path.join(STORE_DIR, `${userid.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`);
}

function readState(userid: string): BugCreateFlowState | null {
  ensureStoreDir();
  const storeFile = getStoreFile(userid);
  if (!existsSync(storeFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(storeFile, "utf8")) as BugCreateFlowState;
    if (!parsed || typeof parsed !== "object" || Date.now() - parsed.updatedAt > EXPIRY_MS) {
      rmSync(storeFile, { force: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(state: BugCreateFlowState): void {
  ensureStoreDir();
  writeFileSync(getStoreFile(state.userid), JSON.stringify(state, null, 2), "utf8");
}

function saveBugCreateFlow(userid: string, stage: BugCreateFlowState["stage"], draft: BugTemplateDraft): BugCreateFlowState {
  const state: BugCreateFlowState = {
    userid,
    stage,
    draft,
    updatedAt: Date.now(),
  };
  writeState(state);
  return state;
}

function normalizeCardValue(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "-";
}

function buildConfirmBody(draft: BugTemplateDraft): string {
  const sections: string[] = [
    "【提单摘要】",
    `标题：${normalizeCardValue(draft.title)}`,
    `所属产品：${normalizeCardValue(draft.product)}`,
    `影响版本：${normalizeCardValue(draft.builds)}`,
    `所属模块：${normalizeCardValue(draft.module)}`,
    `当前指派：${normalizeCardValue(draft.assignedTo)}`,
    `Bug类型：${normalizeCardValue(draft.type)}`,
    `严重程度：${normalizeCardValue(draft.severity)}`,
    `优先级：${normalizeCardValue(draft.pri)}`,
    "",
    "【复现信息】",
    `重现步骤：\n${normalizeCardValue(draft.steps)}`,
    "",
    `实际结果：\n${normalizeCardValue(draft.actualResult)}`,
    "",
    `期望结果：\n${normalizeCardValue(draft.expectedResult)}`,
  ];

  const environmentLines = [
    draft.environment ? `环境：${draft.environment}` : "",
    draft.browser ? `浏览器：${draft.browser}` : "",
    draft.os ? `操作系统：${draft.os}` : "",
  ].filter(Boolean);
  if (environmentLines.length > 0) {
    sections.push("", "【环境补充】", ...environmentLines);
  }

  sections.push("", "如需修改，可继续发送模板字段覆盖当前草稿。");
  return sections.join("\n");
}

function buildConfirmReply(userid: string, draft: BugTemplateDraft): JsonObject {
  saveBugCreateFlow(userid, "confirming", draft);
  return {
    ok: true,
    userid,
    intent: "create-bug",
    bug_flow_stage: "confirming",
    route_args: buildBugCreatePayload(draft),
    reply_text: buildConfirmBody(draft),
  };
}

function buildDraftPatch(text: string): Partial<BugTemplateDraft> {
  return looksLikeBugTemplate(text)
    ? parseBugTemplate(text)
    : parseBugTemplateFieldLine(text);
}

function hasDraftPatch(patch: Partial<BugTemplateDraft>): boolean {
  return Object.keys(patch).length > 0;
}

function shouldHandleBugFlowFollowup(text: string): boolean {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return false;
  }
  if (
    isBugTemplateRequest(trimmedText)
    || wantsFullBugTemplate(trimmedText)
    || isBugConfirmReply(trimmedText)
    || isBugCancelReply(trimmedText)
  ) {
    return true;
  }

  return hasDraftPatch(buildDraftPatch(trimmedText));
}

function maybeBuildAgentConfirmCard(userid: string, draft: BugTemplateDraft): string {
  return JSON.stringify({
    template_card: buildButtonInteractionCard({
      title: "Bug 正式提单确认",
      desc: `待提交人：${userid}`,
      body: buildConfirmBody(draft),
      taskId: `bug-create-confirm-${userid}-${Date.now()}`,
      horizontalContentList: [
        { keyname: "所属产品", value: normalizeCardValue(draft.product) },
        { keyname: "影响版本", value: normalizeCardValue(draft.builds) },
        { keyname: "严重程度", value: normalizeCardValue(draft.severity) },
        { keyname: "优先级", value: normalizeCardValue(draft.pri) },
      ],
      quoteText: "确认后将正式调用禅道创建 Bug；取消后本次草稿会清空。",
      buttonList: [
        {
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugCreateConfirm),
          label: "确认创建",
          style: 1,
        },
        {
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugCreateCancel),
          label: "取消创建",
          style: 2,
        },
      ],
    }),
  });
}

export function clearBugCreateFlow(userid: string): void {
  rmSync(getStoreFile(userid), { force: true });
}

export function loadBugCreateFlow(userid: string): BugCreateFlowState | null {
  return readState(userid);
}

export function isBugTemplateRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return [
    "提bug",
    "提 bug",
    "创建bug",
    "创建 bug",
    "新建bug",
    "新建 bug",
    "提缺陷",
    "提bug 完整模板",
    "提bug 全量模板",
    "创建bug 完整模板",
    "创建bug 全量模板",
  ].includes(normalized);
}

export function wantsFullBugTemplate(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized.includes("完整模板") || normalized.includes("全量模板");
}

export function isBugConfirmReply(text: string): boolean {
  return ["确认", "确认创建", "提交", "提交创建"].includes(text.trim());
}

export function isBugCancelReply(text: string): boolean {
  return ["取消", "取消创建", "退出", "结束"].includes(text.trim());
}

export function startBugCreateFlow(userid: string, fullTemplate = false): JsonObject {
  saveBugCreateFlow(userid, "collecting", {});
  return {
    ok: true,
    userid,
    intent: "create-bug",
    route_script: "create-bug",
    bug_flow_stage: "collecting",
    reply_text: fullTemplate
      ? buildFullTemplateText()
      : `${buildRequiredTemplateText()}\n\n如需更多字段，可继续填写可选字段，或回复“提bug 完整模板”。`,
  };
}

export function continueBugCreateFlow(userid: string, text: string): JsonObject | null {
  const state = readState(userid);
  if (!state) {
    return null;
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: state.stage,
      reply_text: "这次提 Bug 会话已保留，请继续补充模板内容，或回复“取消”结束。",
    };
  }

  if (isBugCancelReply(trimmedText)) {
    clearBugCreateFlow(userid);
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: "cancelled",
      reply_text: "已取消本次 Bug 创建。",
    };
  }

  if (wantsFullBugTemplate(trimmedText)) {
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: state.stage,
      reply_text: buildFullTemplateText(),
    };
  }

  if (state.stage === "confirming" && isBugConfirmReply(trimmedText)) {
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: "ready_to_submit",
      route_args: buildBugCreatePayload(state.draft),
      execute_bug_create: true,
      matched_by: "bug-flow-confirm",
    };
  }

  const patch = buildDraftPatch(trimmedText);
  if (!hasDraftPatch(patch) && state.stage === "confirming") {
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: "confirming",
      reply_text: "如信息无误，请回复“确认创建”；如需修改，可继续发送模板字段；如要放弃本次创建，请回复“取消”。",
    };
  }

  const mergedDraft = mergeBugDraft(state.draft, patch);
  const missingFields = collectMissingRequiredBugFields(mergedDraft);

  if (missingFields.length > 0) {
    saveBugCreateFlow(userid, "collecting", mergedDraft);
    return {
      ok: true,
      userid,
      intent: "create-bug",
      bug_flow_stage: "collecting",
      route_args: buildBugCreatePayload(mergedDraft),
      missing_args: missingFields,
      reply_text: buildMissingFieldsReply(missingFields),
    };
  }

  return buildConfirmReply(userid, mergedDraft);
}

export function resolveBugCreateInteractiveAction(actionKey: string, userid: string): BugCreateInteractiveResolution | null {
  if (actionKey === WECOM_INTERACTIVE_ACTIONS.bugCreateCancel) {
    clearBugCreateFlow(userid);
    return {
      kind: "reply",
      result: {
        ok: true,
        userid,
        intent: "create-bug",
        bug_flow_stage: "cancelled",
        reply_text: "已取消本次 Bug 创建，当前草稿已清空。",
      },
    };
  }

  if (actionKey !== WECOM_INTERACTIVE_ACTIONS.bugCreateConfirm) {
    return null;
  }

  const state = loadBugCreateFlow(userid);
  if (!state) {
    return {
      kind: "reply",
      result: {
        ok: false,
        userid,
        intent: "create-bug",
        bug_flow_stage: "expired",
        reply_text: "这张确认卡对应的 Bug 草稿已失效，请重新发送“提bug”开始。",
      },
    };
  }

  const missingFields = collectMissingRequiredBugFields(state.draft);
  if (missingFields.length > 0) {
    saveBugCreateFlow(userid, "collecting", state.draft);
    return {
      kind: "reply",
      result: {
        ok: false,
        userid,
        intent: "create-bug",
        bug_flow_stage: "collecting",
        missing_args: missingFields,
        reply_text: buildMissingFieldsReply(missingFields),
      },
    };
  }

  return {
    kind: "execute",
    routeArgs: buildBugCreatePayload(state.draft),
  };
}

export async function resolveBugCreateFlowReply(input: ResolveBugCreateFlowInput): Promise<JsonObject | null> {
  const { text, userid, sourceType, routes, dispatchRoute } = input;
  const existingFlow = loadBugCreateFlow(userid);
  if (existingFlow) {
    if (!shouldHandleBugFlowFollowup(text)) {
      return null;
    }

    const flowResult = continueBugCreateFlow(userid, text);
    if (!flowResult) {
      return null;
    }

    if (flowResult.execute_bug_create === true) {
      const route = routes.find((item) => item.intent === "create-bug");
      if (!route) {
        return {
          ok: false,
          userid,
          intent: "create-bug",
          error: "Missing create-bug route definition.",
          reply_text: "当前未找到 create-bug 路由，请先检查配置。",
        };
      }

      const dispatchResult = await dispatchRoute(
        { route, trigger: "bug-flow-confirm" },
        text,
        userid,
        (flowResult.route_args as Record<string, string>) ?? {},
      );
      if (dispatchResult.ok !== false) {
        clearBugCreateFlow(userid);
      }
      return dispatchResult;
    }

    if (flowResult.bug_flow_stage === "cancelled") {
      clearBugCreateFlow(userid);
    }

    if (sourceType === "agent" && flowResult.bug_flow_stage === "confirming") {
      const latestFlow = loadBugCreateFlow(userid) ?? existingFlow;
      return {
        ...flowResult,
        reply_text: maybeBuildAgentConfirmCard(userid, latestFlow.draft),
      };
    }
    return flowResult;
  }

  if (!isBugTemplateRequest(text)) {
    return null;
  }

  return startBugCreateFlow(userid, wantsFullBugTemplate(text));
}

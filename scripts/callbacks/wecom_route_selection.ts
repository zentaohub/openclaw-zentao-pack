import type { JsonObject } from "../shared/zentao_client";
import { savePendingRouteSelection } from "../shared/wecom_pending_route_store";
import type { ContextCandidate, ContextEntityName } from "../shared/wecom_session_context_store";
import type { IntentRoute } from "./wecom_route_resolver";

export interface RouteSelectionReplyOptions {
  userid: string;
  route: IntentRoute;
  trigger: string | null;
  originalText: string;
  args: Record<string, string>;
  entity: ContextEntityName;
  candidates: ContextCandidate[];
  intro: string;
}

export const ENTITY_LABELS: Record<ContextEntityName, string> = {
  product: "产品",
  project: "项目",
  execution: "迭代",
  testtask: "测试单",
  story: "需求",
  task: "任务",
  bug: "Bug",
  release: "发布",
  case: "用例",
  run: "执行记录",
};

export function buildRouteSelectionReply(options: RouteSelectionReplyOptions): JsonObject {
  savePendingRouteSelection({
    userid: options.userid,
    routeIntent: options.route.intent,
    routeTrigger: options.trigger,
    originalText: options.originalText,
    args: options.args,
    entity: options.entity,
    candidates: options.candidates.slice(0, 8),
  });

  const label = ENTITY_LABELS[options.entity];
  const lines = [
    `已识别为禅道指令：${options.route.intent}`,
    options.intro,
    ...options.candidates.slice(0, 8).map((item, index) => `${index + 1}. ${label}#${item.id} ${item.name ?? ""}`.trimEnd()),
    `请直接回复“第1个${label}”或“取消”。`,
  ];

  return {
    ok: true,
    userid: options.userid,
    intent: options.route.intent,
    route_script: options.route.script,
    route_args: options.args,
    pending_route_selection: true,
    pending_entity: options.entity,
    pending_candidates: options.candidates.map((item) => ({ id: item.id, name: item.name ?? null })),
    reply_text: lines.join("\n"),
  };
}

export function parseRouteSelectionIndex(text: string, entity: ContextEntityName, maxCount: number): number | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const label = ENTITY_LABELS[entity];
  const patterns = [
    new RegExp(`第\\s*(\\d+)\\s*个?${label}`, "iu"),
    /第\s*(\d+)\s*个/u,
    /(?:选|就要|我要|用)\s*(\d+)/u,
    /^(\d+)$/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const index = Number.parseInt(match[1], 10);
    if (!Number.isFinite(index) || index < 1 || index > maxCount) {
      return null;
    }
    return index - 1;
  }

  return null;
}

export function buildPendingRouteSelectionPrompt(entity: ContextEntityName, candidates: ContextCandidate[]): string {
  const label = ENTITY_LABELS[entity];
  return [
    `请确认要使用哪个${label}：`,
    ...candidates.slice(0, 8).map((item, index) => `${index + 1}. ${label}#${item.id} ${item.name ?? ""}`.trimEnd()),
    `直接回复“第1个${label}”即可继续，也可以回复“取消”。`,
  ].join("\n");
}

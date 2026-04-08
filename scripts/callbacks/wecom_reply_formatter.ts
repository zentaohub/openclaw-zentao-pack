import { type JsonObject } from "../shared/zentao_client";
import { resolveReplyTemplate } from "../replies/template_registry";
import { resolveAgentReplyTemplate } from "../replies/agent_template_registry";
import type { WecomMessageSource } from "../shared/wecom_payload";
import { type IntentRoute } from "./wecom_route_resolver";

export interface FormatterRoute {
  intent: string;
  script: string;
}

export function buildRouteHelpText(routes: Array<{ triggers: string[] }>): string {
  const examples = routes.slice(0, 10).flatMap((route) => route.triggers.slice(0, 1));
  return [
    "已识别为禅道机器人指令入口。",
    "当前优先按 intent-routing.yaml 做快速路由。",
    "可直接尝试：",
    ...examples.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n");
}

export function buildMissingArgsReply(route: FormatterRoute, missingArgs: string[]): string {
  return [
    `已识别为禅道指令：${route.intent}`,
    `当前缺少必要参数：${missingArgs.join("、")}`,
    "请补充最小必要信息后重试。",
  ].join("\n");
}

export function buildScriptResultReply(
  route: IntentRoute,
  result: JsonObject,
  userid: string,
  sourceType: WecomMessageSource,
  routeArgs: Record<string, string>,
): string {
  if (
    typeof result.reply_text === "string" &&
    result.reply_text.trim() &&
    result.reply_text_override === true
  ) {
    return result.reply_text.trim();
  }

  const template = sourceType === "agent"
    ? resolveAgentReplyTemplate(route.replyTemplate)
    : resolveReplyTemplate(route.replyTemplate);

  return template.render({
    intent: route.intent,
    script: route.script,
    userid,
    sourceType,
    routeArgs,
    result,
  });
}

export function buildScriptErrorReply(route: FormatterRoute, result: JsonObject): string {
  return `已识别为禅道指令：${route.intent}\n执行脚本失败：${typeof result.error === "string" ? result.error : "unknown error"}`;
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { type JsonObject } from "../shared/zentao_client";

export interface IntentRoute {
  intent: string;
  triggers: string[];
  script: string;
  requiredArgs: string[];
  requiredArgsAny: string[];
  defaultArgs: Record<string, string>;
  replyTemplate?: string;
}

export interface RouteMatch {
  route: IntentRoute;
  trigger: string | null;
}

const INTENT_ROUTING_PATH = path.resolve(__dirname, "../../../agents/modules/intent-routing.yaml");
const BARE_NUMBER_EXECUTION_INTENTS = new Set([
  "query-test-exit-readiness",
  "query-go-live-checklist",
  "query-acceptance-overview",
  "query-closure-readiness",
  "query-closure-items",
  "query-testtasks",
]);
const ENTITY_PATTERNS: Record<string, RegExp[]> = {
  product: [/(?:产品|product)\s*[#：:,-]?\s*(\d+)/giu],
  project: [/(?:项目|project)\s*[#：:,-]?\s*(\d+)/giu],
  execution: [/(?:执行|迭代|sprint|execution)\s*[#：:,-]?\s*(\d+)/giu],
  testtask: [/(?:测试单|测试任务|testtask)\s*[#：:,-]?\s*(\d+)/giu],
  story: [/(?:需求|story)\s*[#：:,-]?\s*(\d+)/giu],
  task: [/(?:任务|task)\s*[#：:,-]?\s*(\d+)/giu],
  bug: [/(?:bug|缺陷)\s*[#：:,-]?\s*(\d+)/giu],
  release: [/(?:发布|release)\s*[#：:,-]?\s*(\d+)/giu],
  run: [/(?:run|执行记录)\s*[#：:,-]?\s*(\d+)/giu],
  case: [/(?:用例|case)\s*[#：:,-]?\s*(\d+)/giu],
  module: [/(?:模块|module)\s*[#：:,-]?\s*(\d+)/giu],
  program: [/(?:项目集|program)\s*[#：:,-]?\s*(\d+)/giu],
};

function normalizeText(text: string): string {
  let normalized = text.trim().toLowerCase();
  normalized = normalized.replace(/[，。！？,.!?:：；;]/gu, " ");
  normalized = normalized.replace(/\s+/gu, " ").trim();

  normalized = normalized.replace(/^(帮我|给我|麻烦你|麻烦|请你|请|帮忙)\s*/u, "");
  normalized = normalized.replace(/(帮我|给我|麻烦你|麻烦|请你|请|帮忙)/gu, " ");

  normalized = normalized.replace(/看看/gu, "看");
  normalized = normalized.replace(/看一下/gu, "看");
  normalized = normalized.replace(/看下/gu, "看");
  normalized = normalized.replace(/看一眼/gu, "看");
  normalized = normalized.replace(/查一下/gu, "查");
  normalized = normalized.replace(/查下/gu, "查");
  normalized = normalized.replace(/问一下/gu, "问");
  normalized = normalized.replace(/评估下/gu, "评估");
  normalized = normalized.replace(/确认下/gu, "确认");

  normalized = normalized.replace(/报个\s*bug/gu, "报 bug");
  normalized = normalized.replace(/提个\s*bug/gu, "提 bug");
  normalized = normalized.replace(/建个任务/gu, "创建任务");
  normalized = normalized.replace(/建个产品/gu, "创建产品");
  normalized = normalized.replace(/建个模块/gu, "创建模块");

  normalized = normalized.replace(/^(现在|当前)\s*/u, "");
  normalized = normalized.replace(/\s+/gu, " ").trim();
  return normalized;
}

function parseInlineList(rawValue: string): string[] {
  return rawValue
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseIntentRoutes(yamlText: string): IntentRoute[] {
  const routes: IntentRoute[] = [];
  const lines = yamlText.replace(/^\uFEFF/, "").split(/\r?\n/);
  let current: IntentRoute | null = null;
  let currentMap: "defaultArgs" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "    ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (line.startsWith("  - intent:")) {
      if (current) {
        routes.push(current);
      }
      current = {
        intent: trimmed.slice("- intent:".length).trim(),
        triggers: [],
        script: "",
        requiredArgs: [],
        requiredArgsAny: [],
        defaultArgs: {},
      };
      currentMap = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("triggers:")) {
      const value = trimmed.slice("triggers:".length).trim();
      current.triggers = value.startsWith("[") ? parseInlineList(value) : [];
      currentMap = null;
      continue;
    }

    if (trimmed.startsWith("script:")) {
      current.script = trimmed.slice("script:".length).trim();
      currentMap = null;
      continue;
    }

    if (trimmed.startsWith("required_args_any:")) {
      const value = trimmed.slice("required_args_any:".length).trim();
      current.requiredArgsAny = value.startsWith("[") ? parseInlineList(value) : [];
      currentMap = null;
      continue;
    }

    if (trimmed.startsWith("reply_template:")) {
      current.replyTemplate = trimmed.slice("reply_template:".length).trim();
      currentMap = null;
      continue;
    }

    if (trimmed.startsWith("required_args:")) {
      const value = trimmed.slice("required_args:".length).trim();
      current.requiredArgs = value.startsWith("[") ? parseInlineList(value) : [];
      currentMap = null;
      continue;
    }

    if (trimmed.startsWith("default_args:")) {
      currentMap = "defaultArgs";
      continue;
    }

    if (currentMap === "defaultArgs" && line.startsWith("      ")) {
      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex > 0) {
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        current.defaultArgs[key] = value;
      }
      continue;
    }

    currentMap = null;
  }

  if (current) {
    routes.push(current);
  }

  return routes.filter((route) => route.intent && route.script);
}

export function loadIntentRoutes(): IntentRoute[] {
  return parseIntentRoutes(readFileSync(INTENT_ROUTING_PATH, "utf8"));
}

export function findRouteByIntent(intent: string, routes: IntentRoute[]): IntentRoute | null {
  return routes.find((route) => route.intent === intent) ?? null;
}

export function findRouteMatch(text: string, routes: IntentRoute[]): RouteMatch | null {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  let best: RouteMatch | null = null;
  for (const route of routes) {
    for (const trigger of route.triggers) {
      const normalizedTrigger = normalizeText(trigger);
      if (!normalizedTrigger) {
        continue;
      }
      if (normalized.includes(normalizedTrigger)) {
        if (!best || normalizedTrigger.length > (best.trigger?.length ?? 0)) {
          best = { route, trigger };
        }
      }
    }
  }

  return best;
}

function extractLastMatch(text: string, expressions: RegExp[]): string | undefined {
  let matchedValue: string | undefined;
  for (const expression of expressions) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      if (match[1]) {
        matchedValue = match[1];
      }
    }
  }
  return matchedValue;
}

function extractAssignedTo(text: string): string | undefined {
  const directMatch = extractLastMatch(text, [
    /(?:assigned-to|assignedto)\s*[#:= -]?\s*([^\s,.;:]+)/giu,
  ]);
  if (directMatch) {
    return directMatch;
  }

  const ownerToken = "\u8d1f\u8d23\u4eba";
  const giveToken = "\u7ed9";

  const ownerIndex = text.lastIndexOf(ownerToken);
  if (ownerIndex >= 0) {
    const tail = text.slice(ownerIndex + ownerToken.length).trimStart().replace(/^[#:= -]+/u, "");
    const match = tail.match(/^\S+/u);
    if (match?.[0]) {
      return match[0];
    }
  }

  const giveIndex = text.lastIndexOf(giveToken);
  if (giveIndex >= 0) {
    const tail = text.slice(giveIndex + giveToken.length).trimStart();
    const match = tail.match(/^\S+/u);
    if (match?.[0]) {
      return match[0];
    }
  }

  return undefined;
}

export function extractRouteArgs(text: string, route: IntentRoute, userid: string): Record<string, string> {
  const args: Record<string, string> = {};
  if (route.defaultArgs.userid === "current_user") {
    args.userid = userid;
  }
  if (!args.userid) {
    args.userid = userid;
  }

  for (const [name, expressions] of Object.entries(ENTITY_PATTERNS)) {
    const value = extractLastMatch(text, expressions);
    if (value) {
      args[name] = value;
    }
  }

  const bareNumbers = Array.from(text.matchAll(/(?<![A-Za-z0-9])(\d+)(?![A-Za-z0-9])/g), (match) => match[1]);
  const uniqueBareNumbers = Array.from(new Set(bareNumbers));
  if (uniqueBareNumbers.length === 1) {
    const onlyNumber = uniqueBareNumbers[0];
    const numericRequiredArgs = route.requiredArgs.filter((name) => ENTITY_PATTERNS[name]);
    if (numericRequiredArgs.length === 1 && !args[numericRequiredArgs[0]]) {
      args[numericRequiredArgs[0]] = onlyNumber;
    }

    if (BARE_NUMBER_EXECUTION_INTENTS.has(route.intent)) {
      if (!args.execution && !args.testtask && !args.project && !args.product) {
        args.execution = onlyNumber;
      }
    }
  }

  if (route.intent === "assign-bug" && !args["assigned-to"]) {
    const assignedTo = extractAssignedTo(text);
    if (assignedTo) {
      args["assigned-to"] = assignedTo;
    }
  }

  return args;
}

export function normalizeRouteArgs(value: JsonObject | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  const args: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) {
      continue;
    }
    const normalized = String(raw).trim();
    if (!normalized) {
      continue;
    }
    args[key] = normalized;
  }

  return args;
}

export function collectMissingArgs(route: IntentRoute, args: Record<string, string>): string[] {
  const missing = route.requiredArgs.filter((name) => !args[name]);
  if (route.requiredArgsAny.length > 0 && !route.requiredArgsAny.some((name) => Boolean(args[name]))) {
    missing.push(route.requiredArgsAny.join(" / "));
  }
  return missing;
}

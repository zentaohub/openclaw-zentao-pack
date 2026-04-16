import { readFileSync } from "node:fs";
import path from "node:path";
import { type JsonObject } from "../shared/zentao_client";

export interface IntentRouteLite {
  intent: string;
  triggers: string[];
  requiredArgs: string[];
  requiredArgsAny: string[];
  optionalArgs: string[];
}

export interface LlmIntentDecision extends JsonObject {
  is_zentao_request: boolean;
  intent?: string;
  args?: JsonObject;
  missing_args?: string[];
  confidence?: number;
  reason?: string;
}

interface RuntimeProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  model: string;
}

const OPENAI_YAML_PATH = path.resolve(__dirname, "../../../agents/openai.yaml");
const OPENCLAW_RUNTIME_PATH = "/root/.openclaw/private/openclaw.runtime.json";
const WECOM_LLM_CLASSIFIER_TIMEOUT_MS = Number.parseInt(
  process.env.WECOM_LLM_CLASSIFIER_TIMEOUT_MS ?? "8000",
  10,
);
const NON_ZENTAO_FAST_REPLIES = [
  "你是谁",
  "帮助",
  "help",
  "你会什么",
  "支持哪些命令",
  "你好",
  "在吗",
  "收到没",
  "怎么提bug",
  "如何提bug",
  "怎么创建bug",
  "怎么查任务",
  "如何查任务",
  "怎么查询任务",
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
const BUSINESS_ACTION_HINTS = [
  "查",
  "查询",
  "查看",
  "看",
  "创建",
  "新建",
  "建立",
  "建",
  "提",
  "报",
  "指派",
  "分配",
  "更新",
  "修改",
  "关闭",
  "开始",
  "完成",
  "上线",
  "提测",
  "验收",
];
const STRUCTURED_BUSINESS_HINTS = [
  "叫",
  "命名",
  "模块",
  "负责人",
  "指派给",
  "产品负责人",
  "测试负责人",
  "研发负责人",
  "优先级",
  "所属",
  "描述",
  "标题",
  "内容",
  "顺手",
  "同时",
  "并且",
  "都给",
];

function firstNonEmptyString(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeClassifierText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/@\S+/gu, " ")
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’`~\-_/\\|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function countMatchedHints(text: string, hints: string[]): number {
  return hints.reduce((count, hint) => count + (text.includes(hint) ? 1 : 0), 0);
}

function hasStructuredBusinessSignals(text: string): boolean {
  const normalized = normalizeClassifierText(text);
  if (!normalized) {
    return false;
  }

  const actionHits = countMatchedHints(normalized, BUSINESS_ACTION_HINTS);
  const keywordHits = countMatchedHints(normalized, ZENTAO_BUSINESS_KEYWORDS);
  const structuredHits = countMatchedHints(normalized, STRUCTURED_BUSINESS_HINTS);
  const hasEntityId = /(?:产品|项目|迭代|执行|需求|任务|bug|缺陷|发布|测试单)\s*[#：:,-]?\s*\d+/iu.test(normalized);
  const hasInlineList = /[、,，]/u.test(normalized);
  const hasLongInstruction = normalized.length >= 14;

  if (keywordHits >= 2 && actionHits >= 1) {
    return true;
  }

  if (structuredHits >= 2 && actionHits >= 1) {
    return true;
  }

  if (hasEntityId && actionHits >= 1) {
    return true;
  }

  if (hasLongInstruction && actionHits >= 1 && (keywordHits >= 1 || structuredHits >= 1 || hasInlineList)) {
    return true;
  }

  return false;
}

function buildBusinessSignalSummary(text: string): string[] {
  const normalized = normalizeClassifierText(text);
  if (!normalized) {
    return [];
  }

  const signals: string[] = [];
  const matchedKeywords = ZENTAO_BUSINESS_KEYWORDS.filter((keyword) => normalized.includes(keyword));
  const matchedActions = BUSINESS_ACTION_HINTS.filter((keyword) => normalized.includes(keyword));
  const matchedStructured = STRUCTURED_BUSINESS_HINTS.filter((keyword) => normalized.includes(keyword));

  if (matchedKeywords.length > 0) {
    signals.push(`业务对象词: ${matchedKeywords.join(", ")}`);
  }
  if (matchedActions.length > 0) {
    signals.push(`动作词: ${matchedActions.join(", ")}`);
  }
  if (matchedStructured.length > 0) {
    signals.push(`结构化字段词: ${matchedStructured.join(", ")}`);
  }
  if (/(?:产品|项目|迭代|执行|需求|任务|bug|缺陷|发布|测试单)\s*[#：:,-]?\s*\d+/iu.test(normalized)) {
    signals.push("包含业务对象编号");
  }
  if (/[、,，]/u.test(normalized)) {
    signals.push("包含列表型参数");
  }
  if (normalized.length >= 14) {
    signals.push("属于较长业务描述");
  }

  return signals;
}

function isObviousNonZentao(text: string): boolean {
  const normalized = normalizeClassifierText(text);
  if (!normalized) {
    return false;
  }

  if (hasStructuredBusinessSignals(normalized)) {
    return false;
  }

  if (NON_ZENTAO_FAST_REPLIES.includes(normalized)) {
    return true;
  }

  if (ZENTAO_BUSINESS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  return normalized.length <= 24 && OPEN_QUESTION_HINTS.some((hint) => normalized.includes(hint));
}

function isLikelyMeaninglessShortInput(text: string): boolean {
  const normalized = normalizeClassifierText(text);
  if (!normalized || normalized.length > 12) {
    return false;
  }

  if (hasStructuredBusinessSignals(normalized)) {
    return false;
  }

  if (ZENTAO_BUSINESS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  if (OPEN_QUESTION_HINTS.some((hint) => normalized.includes(hint))) {
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

function loadAgentPrompt(): string {
  const raw = readFileSync(OPENAI_YAML_PATH, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("default_prompt: |"));
  if (start < 0) {
    return "你是禅道意图分类器。";
  }

  const output: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("  ")) {
      output.push(line.slice(2));
      continue;
    }
    if (!line.trim()) {
      output.push("");
      continue;
    }
    break;
  }

  return output.join("\n").trim() || "你是禅道意图分类器。";
}

function loadRuntimeProvider(): RuntimeProviderConfig | null {
  try {
    const runtime = JSON.parse(readFileSync(OPENCLAW_RUNTIME_PATH, "utf8")) as JsonObject;
    const agents = runtime.agents as JsonObject | undefined;
    const defaults = agents?.defaults as JsonObject | undefined;
    const modelConfig = defaults?.model as JsonObject | undefined;
    const primary = typeof modelConfig?.primary === "string" ? modelConfig.primary : "";
    const [providerId, modelId] = primary.split("/");
    if (!providerId || !modelId) {
      return null;
    }

    const models = runtime.models as JsonObject | undefined;
    const providers = models?.providers as JsonObject | undefined;
    const provider = providers?.[providerId] as JsonObject | undefined;
    const baseUrl = firstNonEmptyString(provider?.baseUrl as string | undefined, provider?.base_url as string | undefined);
    const api = firstNonEmptyString(provider?.api as string | undefined);
    const apiKey = firstNonEmptyString(provider?.apiKey as string | undefined, provider?.api_key as string | undefined);
    if (!baseUrl || !api || !apiKey) {
      return null;
    }

    return {
      baseUrl,
      api,
      apiKey,
      model: modelId,
    };
  } catch {
    return null;
  }
}

function buildRouteCatalog(routes: IntentRouteLite[]): string {
  return routes
    .map((route) => {
      const required = route.requiredArgs.length > 0 ? route.requiredArgs.join(", ") : "无";
      const requiredAny = route.requiredArgsAny.length > 0 ? route.requiredArgsAny.join(" / ") : "无";
      const optional = route.optionalArgs.length > 0 ? route.optionalArgs.join(", ") : "无";
      return `- intent=${route.intent}; triggers=${route.triggers.join(" | ")}; required_args=${required}; required_args_any=${requiredAny}; optional_args=${optional}`;
    })
    .join("\n");
}

function buildClassifierMessages(text: string, userid: string, routes: IntentRouteLite[]): { system: string; user: string } {
  const signalSummary = buildBusinessSignalSummary(text);
  const system = [
    loadAgentPrompt(),
    "",
    "你现在只做一件事：判断当前输入是否属于禅道请求，并从给定意图列表中选择最匹配的一项。",
    "不要输出自然语言说明，不要输出包装格式，只能输出一个 JSON 对象。",
    "如果不是禅道请求，输出 is_zentao_request=false。",
    "如果是禅道请求，只能从候选 intent 里选择 intent。",
    "尽量抽取 args，值统一输出字符串。",
    "如果参数不足，填入 missing_args。",
    "判断优先级规则：",
    "1. 短寒暄、帮助、介绍、无业务对象的闲聊，判为非禅道。",
    "2. 只要输入是围绕产品、项目、迭代、需求、任务、Bug、发布、测试等对象的操作指令、查询指令、创建指令、状态指令，即使语气口语化，也优先判为禅道。",
    "3. 如果一句话里同时出现对象名、模块名、负责人、列表项、编号、标题、描述、指派等结构化字段，应明显偏向禅道请求。",
    "4. 长自然语言业务描述不要因为出现“帮我、看下、能不能、顺手、都给”这类口语词就误判为闲聊。",
    "短语理解规则：",
    "1. 迭代、执行、sprint 默认映射到 execution。",
    "2. 测试准出、能不能提测、能否准出，优先映射到 query-test-exit-readiness。",
    "3. 上线检查、发布前检查，优先映射到 query-go-live-checklist。",
    "4. 我的任务、我的 bug 这类‘我的’命令默认对应当前 userid。",
    "5. 像‘列表里有没有某条记录’、‘查某个名称/标题’这类存在性或检索表达，如果候选 route 声明了 optional_args=keywords，应尽量把关键词抽到 args.keywords。",
    "6. 除非非常确定，不要把普通闲聊识别成禅道请求；但对长业务句、结构化字段句、包含明确业务对象的口语指令，不要过度保守。",
    "7. “帮我建一个产品，叫A，顺手把模块也建好：X、Y、Z，产品负责人、测试负责人、研发负责人都给张三” 这类输入，应识别为 create-product-with-modules。",
    "8. “帮我看看 4 号迭代能不能提测”“这个版本现在可以上线吗” 这类口语业务句，若语义明确，应优先判为禅道请求。",
    "",
    "输出 JSON schema：",
    '{"is_zentao_request":true,"intent":"...","args":{"execution":"4"},"missing_args":[],"confidence":0.91,"reason":"..."}',
    "",
    "候选 intent 列表：",
    buildRouteCatalog(routes),
  ].join("\n");

  const user = [
    `当前企微 userid: ${userid}`,
    `用户原始输入: ${text}`,
    signalSummary.length > 0 ? `输入中的业务信号:\n- ${signalSummary.join("\n- ")}` : "输入中的业务信号: 无明显业务信号",
    "请只返回 JSON。",
  ].join("\n");

  return { system, user };
}

async function requestJson(url: string, apiKey: string, body: JsonObject): Promise<JsonObject> {
  const timeoutMs = Number.isFinite(WECOM_LLM_CLASSIFIER_TIMEOUT_MS) && WECOM_LLM_CLASSIFIER_TIMEOUT_MS > 0
    ? WECOM_LLM_CLASSIFIER_TIMEOUT_MS
    : 8000;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${rawText}`);
  }

  return JSON.parse(rawText) as JsonObject;
}

function extractTextFromResponsesPayload(payload: JsonObject): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const content = Array.isArray((item as JsonObject).content) ? ((item as JsonObject).content as unknown[]) : [];
    for (const entry of content) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        continue;
      }
      const text = firstNonEmptyString((entry as JsonObject).text as string | undefined, (entry as JsonObject).output_text as string | undefined);
      if (text) {
        chunks.push(text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractTextFromChatPayload(payload: JsonObject): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || Array.isArray(firstChoice)) {
    return "";
  }
  const message = (firstChoice as JsonObject).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return "";
  }
  const content = (message as JsonObject).content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return "";
        }
        return firstNonEmptyString((item as JsonObject).text as string | undefined) ?? "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function tryParseDecision(rawText: string): LlmIntentDecision | null {
  const normalized = rawText.trim();
  const candidates = [
    normalized,
    normalized.replace(/^```json\s*/i, "").replace(/```$/i, "").trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate) as LlmIntentDecision;
    } catch {
      // continue
    }
  }

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(normalized.slice(start, end + 1)) as LlmIntentDecision;
    } catch {
      return null;
    }
  }

  return null;
}

async function classifyViaResponses(config: RuntimeProviderConfig, system: string, user: string): Promise<string> {
  const payload = await requestJson(`${config.baseUrl.replace(/\/+$/, "")}/responses`, config.apiKey, {
    model: config.model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }],
      },
    ],
    max_output_tokens: 700,
  });
  return extractTextFromResponsesPayload(payload);
}

async function classifyViaChat(config: RuntimeProviderConfig, system: string, user: string): Promise<string> {
  const payload = await requestJson(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, config.apiKey, {
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 700,
    response_format: { type: "json_object" },
  });
  return extractTextFromChatPayload(payload);
}

function normalizeDecision(decision: LlmIntentDecision | null): LlmIntentDecision | null {
  if (!decision) {
    return null;
  }

  const args = decision.args && typeof decision.args === "object" && !Array.isArray(decision.args)
    ? Object.fromEntries(
        Object.entries(decision.args).flatMap(([key, value]) => {
          if (value === undefined || value === null) {
            return [];
          }
          return [[key, String(value)]];
        }),
      )
    : undefined;

  return {
    is_zentao_request: decision.is_zentao_request === true,
    intent: typeof decision.intent === "string" && decision.intent.trim() ? decision.intent.trim() : undefined,
    args: args as JsonObject | undefined,
    missing_args: Array.isArray(decision.missing_args) ? decision.missing_args.map(String) : undefined,
    confidence: typeof decision.confidence === "number" ? decision.confidence : undefined,
    reason: typeof decision.reason === "string" ? decision.reason : undefined,
  };
}

export async function classifyWecomIntentWithLlm(input: {
  text: string;
  userid: string;
  routes: IntentRouteLite[];
}): Promise<LlmIntentDecision | null> {
  if (isObviousNonZentao(input.text)) {
    return {
      is_zentao_request: false,
      confidence: 0.99,
      reason: "obvious_non_zentao_short_input",
    };
  }

  if (isLikelyMeaninglessShortInput(input.text)) {
    return {
      is_zentao_request: false,
      confidence: 0.99,
      reason: "meaningless_short_input",
    };
  }

  const provider = loadRuntimeProvider();
  if (!provider) {
    return null;
  }

  const { system, user } = buildClassifierMessages(input.text, input.userid, input.routes);
  const attempts = provider.api === "openai-completions"
    ? [() => classifyViaChat(provider, system, user), () => classifyViaResponses(provider, system, user)]
    : [() => classifyViaResponses(provider, system, user), () => classifyViaChat(provider, system, user)];

  for (const attempt of attempts) {
    try {
      const rawText = await attempt();
      const parsed = normalizeDecision(tryParseDecision(rawText));
      if (parsed) {
        return parsed;
      }
    } catch {
      // try next endpoint style
    }
  }

  return null;
}

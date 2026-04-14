import { readFileSync } from "node:fs";
import path from "node:path";
import type { RequirementSource, TestcasePayload } from "./types";

interface RuntimeProvider {
  baseUrl: string;
  api: string;
  apiKey: string;
  model: string;
}

const LOCAL_RUNTIME_CANDIDATES = [
  path.resolve(process.cwd(), "requirement-to-testcase/llm.runtime.json"),
  path.resolve(process.cwd(), "requirement-to-testcase/llm.runtime.local.json"),
].filter(Boolean);

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function loadRequirementSkillPrompt(): string {
  const promptPath = path.resolve(process.cwd(), "requirement-to-testcase/prompt.md");
  return readFileSync(promptPath, "utf8").replace(/^\uFEFF/, "").trim();
}

function resolveRuntimeFile(): string | null {
  for (const candidate of LOCAL_RUNTIME_CANDIDATES) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

function loadRuntimeProvider(): RuntimeProvider | null {
  try {
    const runtimeFile = resolveRuntimeFile();
    if (!runtimeFile) {
      return null;
    }
    const runtime = JSON.parse(readFileSync(runtimeFile, "utf8")) as Record<string, unknown>;
    const agents = runtime.agents as Record<string, unknown> | undefined;
    const defaults = agents?.defaults as Record<string, unknown> | undefined;
    const modelConfig = defaults?.model as Record<string, unknown> | undefined;
    const primary = typeof modelConfig?.primary === "string" ? modelConfig.primary : "";
    const [providerId, modelId] = primary.split("/");
    if (!providerId || !modelId) {
      return null;
    }
    const models = runtime.models as Record<string, unknown> | undefined;
    const providers = models?.providers as Record<string, unknown> | undefined;
    const provider = providers?.[providerId] as Record<string, unknown> | undefined;
    const baseUrl = firstNonEmptyString(provider?.baseUrl, provider?.base_url);
    const api = firstNonEmptyString(provider?.api);
    const apiKey = firstNonEmptyString(provider?.apiKey, provider?.api_key);
    if (!baseUrl || !api || !apiKey) {
      return null;
    }
    return { baseUrl, api, apiKey, model: modelId };
  } catch {
    return null;
  }
}

async function requestJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${rawText}`);
  }
  return JSON.parse(rawText) as Record<string, unknown>;
}

function extractTextFromResponsesPayload(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return "";
}

function extractTextFromChatPayload(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function tryParsePayload(rawText: string): TestcasePayload | null {
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
      return JSON.parse(candidate) as TestcasePayload;
    } catch {
      // continue
    }
  }
  return null;
}

function buildUserPrompt(source: RequirementSource, outputDir?: string): string {
  return [
    `需求来源类型：${source.sourceType}`,
    `需求来源名称：${source.sourceName}`,
    source.titleCandidate ? `需求标题候选：${source.titleCandidate}` : "",
    source.warnings.length > 0 ? `解析告警：${source.warnings.join("；")}` : "",
    "请严格遵循技能包中定义的需求分析与测试设计规则。",
    "最终只输出一个 JSON 对象，不要输出 Markdown，不要输出额外说明。",
    JSON.stringify({
      requirement_name: source.titleCandidate || source.sourceName,
      date: "YYYYMMDD",
      output_dir: outputDir || "",
      sheet_name: "测试用例",
      test_cases: [
        {
          "用例ID": "TC-001",
          "模块": "登录",
          "关联需求点": "手机号验证码登录",
          "用例标题": "手机号为空时提交登录",
          "前置条件": "进入登录页",
          "测试步骤": "1. 不输入手机号 2. 点击登录",
          "测试数据": "手机号为空",
          "预期结果": "提示手机号不能为空",
          "优先级": "P0",
          "用例类型": "边界"
        }
      ]
    }, null, 2),
    "需求正文如下：",
    source.rawText,
  ].filter(Boolean).join("\n\n");
}

async function generateViaResponses(config: RuntimeProvider, system: string, user: string): Promise<string> {
  const payload = await requestJson(`${config.baseUrl.replace(/\/+$/, "")}/responses`, config.apiKey, {
    model: config.model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    max_output_tokens: 8000,
  });
  return extractTextFromResponsesPayload(payload);
}

async function generateViaChat(config: RuntimeProvider, system: string, user: string): Promise<string> {
  const payload = await requestJson(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, config.apiKey, {
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });
  return extractTextFromChatPayload(payload);
}

export async function generatePayloadWithLlm(source: RequirementSource, outputDir?: string): Promise<TestcasePayload | null> {
  const provider = loadRuntimeProvider();
  if (!provider) {
    return null;
  }

  const systemPrompt = [
    loadRequirementSkillPrompt(),
    "你当前不需要导出文件，也不需要输出中间分析 Markdown。",
    "你唯一要做的是：严格按技能包规则分析需求，然后将正式测试用例整理为标准 JSON。",
    "输出必须是一个 JSON 对象，不能带解释。",
  ].join("\n\n");

  const userPrompt = buildUserPrompt(source, outputDir);
  const attempts = provider.api === "openai-completions"
    ? [() => generateViaChat(provider, systemPrompt, userPrompt), () => generateViaResponses(provider, systemPrompt, userPrompt)]
    : [() => generateViaResponses(provider, systemPrompt, userPrompt), () => generateViaChat(provider, systemPrompt, userPrompt)];

  for (const attempt of attempts) {
    try {
      const rawText = await attempt();
      const payload = tryParsePayload(rawText);
      if (payload && Array.isArray(payload.test_cases) && payload.test_cases.length > 0) {
        return payload;
      }
    } catch {
      // try next attempt
    }
  }

  return null;
}

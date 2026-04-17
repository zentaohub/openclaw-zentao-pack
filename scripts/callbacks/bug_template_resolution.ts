export interface BugTemplateDraft {
  product?: string;
  builds?: string;
  title?: string;
  steps?: string;
  actualResult?: string;
  expectedResult?: string;
  module?: string;
  assignedTo?: string;
  type?: string;
  severity?: string;
  pri?: string;
  environment?: string;
  browser?: string;
  os?: string;
  keywords?: string;
  deadline?: string;
  story?: string;
  task?: string;
  execution?: string;
  rawText?: string;
}

export interface BugTemplateFieldDefinition {
  key: keyof BugTemplateDraft;
  label: string;
  required: boolean;
  aliases: string[];
}

export const BUG_TEMPLATE_FIELDS: BugTemplateFieldDefinition[] = [
  { key: "product", label: "所属产品", required: true, aliases: ["所属产品", "产品", "product"] },
  { key: "builds", label: "影响版本", required: true, aliases: ["影响版本", "版本", "build", "builds", "version"] },
  { key: "title", label: "Bug标题", required: true, aliases: ["Bug标题", "标题", "bug标题", "bug title", "title"] },
  { key: "steps", label: "重现步骤", required: true, aliases: ["重现步骤", "复现步骤", "步骤", "repro steps", "steps"] },
  { key: "actualResult", label: "实际结果", required: true, aliases: ["实际结果", "实际表现", "actual result"] },
  { key: "expectedResult", label: "期望结果", required: true, aliases: ["期望结果", "预期结果", "expected result"] },
  { key: "module", label: "所属模块", required: false, aliases: ["所属模块", "模块", "module"] },
  { key: "assignedTo", label: "当前指派", required: false, aliases: ["当前指派", "指派给", "指派", "assigned to", "assigned-to"] },
  { key: "type", label: "Bug类型", required: false, aliases: ["Bug类型", "类型", "bug type", "type"] },
  { key: "severity", label: "严重程度", required: false, aliases: ["严重程度", "严重级别", "severity"] },
  { key: "pri", label: "优先级", required: false, aliases: ["优先级", "priority", "pri"] },
  { key: "environment", label: "环境", required: false, aliases: ["环境", "测试环境", "environment", "env"] },
  { key: "browser", label: "浏览器", required: false, aliases: ["浏览器", "browser"] },
  { key: "os", label: "操作系统", required: false, aliases: ["操作系统", "系统", "os"] },
  { key: "keywords", label: "关键词", required: false, aliases: ["关键词", "关键字", "keywords"] },
  { key: "deadline", label: "截止日期", required: false, aliases: ["截止日期", "截止时间", "deadline"] },
  { key: "story", label: "相关需求", required: false, aliases: ["相关需求", "需求", "story"] },
  { key: "task", label: "相关任务", required: false, aliases: ["相关任务", "任务", "task"] },
  { key: "execution", label: "所属执行", required: false, aliases: ["所属执行", "执行", "execution"] },
];

const FIELD_ALIAS_TO_KEY = new Map<string, keyof BugTemplateDraft>();
for (const field of BUG_TEMPLATE_FIELDS) {
  for (const alias of field.aliases) {
    FIELD_ALIAS_TO_KEY.set(normalizeFieldLabel(alias), field.key);
  }
}

function normalizeValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeBlockValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized || undefined;
}

function normalizeFieldLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[：:]/gu, "")
    .replace(/\s+/gu, "");
}

function splitFieldLine(line: string): { label: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([^：:]+)[：:](.*)$/u);
  if (match) {
    return {
      label: match[1].trim(),
      value: match[2].trim(),
    };
  }

  return {
    label: trimmed,
    value: "",
  };
}

function detectFieldStart(line: string): { key: keyof BugTemplateDraft; value: string } | null {
  const parsed = splitFieldLine(line);
  if (!parsed) {
    return null;
  }

  const key = FIELD_ALIAS_TO_KEY.get(normalizeFieldLabel(parsed.label));
  if (!key) {
    return null;
  }

  return { key, value: parsed.value };
}

function assignDraftValue(draft: BugTemplateDraft, key: keyof BugTemplateDraft, lines: string[]): void {
  const joined = normalizeBlockValue(lines.join("\n"));
  if (joined) {
    draft[key] = joined;
  }
}

export function parseBugTemplate(text: string): BugTemplateDraft {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  const draft: BugTemplateDraft = { rawText: text };

  let currentKey: keyof BugTemplateDraft | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (!currentKey) {
      return;
    }
    assignDraftValue(draft, currentKey, currentLines);
    currentKey = null;
    currentLines = [];
  };

  for (const line of lines) {
    const fieldStart = detectFieldStart(line);
    if (fieldStart) {
      flush();
      currentKey = fieldStart.key;
      currentLines = fieldStart.value ? [fieldStart.value] : [];
      continue;
    }

    if (currentKey) {
      currentLines.push(line);
    }
  }

  flush();
  return draft;
}

export function mergeBugDraft(base: BugTemplateDraft | null | undefined, patch: Partial<BugTemplateDraft>): BugTemplateDraft {
  const merged: BugTemplateDraft = { ...(base ?? {}) };
  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey as keyof BugTemplateDraft;
    const value = normalizeBlockValue(typeof rawValue === "string" ? rawValue : undefined);
    if (value) {
      merged[key] = value;
    }
  }
  return merged;
}

export function collectMissingRequiredBugFields(draft: BugTemplateDraft): string[] {
  return BUG_TEMPLATE_FIELDS
    .filter((field) => field.required)
    .filter((field) => !normalizeValue(draft[field.key]))
    .map((field) => field.label);
}

export function buildRequiredTemplateText(): string {
  return [
    "请按下面模板填写并直接回复我：",
    "",
    "所属产品：",
    "影响版本：",
    "Bug标题：",
    "",
    "重现步骤：",
    "1.",
    "2.",
    "3.",
    "",
    "实际结果：",
    "期望结果：",
  ].join("\n");
}

export function buildFullTemplateText(): string {
  return [
    buildRequiredTemplateText(),
    "",
    "可选字段：",
    "所属模块：",
    "当前指派：",
    "Bug类型：",
    "严重程度：",
    "优先级：",
    "环境：",
    "浏览器：",
    "操作系统：",
    "关键词：",
    "截止日期：",
    "相关需求：",
    "相关任务：",
    "所属执行：",
  ].join("\n");
}

export function buildMissingFieldsReply(missingFields: string[]): string {
  return [
    "还缺以下必填字段，请补充后直接回复我：",
    "",
    ...missingFields.map((field) => `${field}：`),
  ].join("\n");
}

function buildEnvironmentBlock(draft: BugTemplateDraft): string | undefined {
  const lines: string[] = [];
  if (normalizeValue(draft.environment)) {
    lines.push(normalizeValue(draft.environment)!);
  }
  if (normalizeValue(draft.browser)) {
    lines.push(`浏览器：${normalizeValue(draft.browser)!}`);
  }
  if (normalizeValue(draft.os)) {
    lines.push(`操作系统：${normalizeValue(draft.os)!}`);
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function buildBugStepsMarkdown(draft: BugTemplateDraft): string {
  const sections: string[] = [];
  if (normalizeBlockValue(draft.steps)) {
    sections.push(`[步骤]\n${normalizeBlockValue(draft.steps)!}`);
  }
  if (normalizeBlockValue(draft.actualResult)) {
    sections.push(`[实际结果]\n${normalizeBlockValue(draft.actualResult)!}`);
  }
  if (normalizeBlockValue(draft.expectedResult)) {
    sections.push(`[期望结果]\n${normalizeBlockValue(draft.expectedResult)!}`);
  }
  const environmentBlock = buildEnvironmentBlock(draft);
  if (environmentBlock) {
    sections.push(`[环境]\n${environmentBlock}`);
  }
  return sections.join("\n\n");
}

export function buildBugCreatePayload(draft: BugTemplateDraft): Record<string, string> {
  const payload: Record<string, string> = {
    product: normalizeValue(draft.product) ?? "",
    builds: normalizeValue(draft.builds) ?? "",
    title: normalizeValue(draft.title) ?? "",
    steps: buildBugStepsMarkdown(draft),
  };

  const mappings: Array<[keyof BugTemplateDraft, string]> = [
    ["module", "module"],
    ["assignedTo", "assigned-to"],
    ["type", "type"],
    ["severity", "severity"],
    ["pri", "pri"],
    ["keywords", "keywords"],
    ["deadline", "deadline"],
    ["story", "story"],
    ["task", "task"],
    ["execution", "execution"],
    ["browser", "browser"],
    ["os", "os"],
    ["actualResult", "actual-result"],
    ["expectedResult", "expected-result"],
    ["environment", "environment"],
  ];

  for (const [draftKey, payloadKey] of mappings) {
    const value = normalizeBlockValue(draft[draftKey]);
    if (value) {
      payload[payloadKey] = value;
    }
  }

  return payload;
}

export function looksLikeBugTemplate(text: string): boolean {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => detectFieldStart(line) !== null);
}

export function getBugFieldLabel(key: keyof BugTemplateDraft): string {
  return BUG_TEMPLATE_FIELDS.find((field) => field.key === key)?.label ?? String(key);
}

export function parseBugTemplateFieldLine(text: string): Partial<BugTemplateDraft> {
  return parseBugTemplate(text);
}

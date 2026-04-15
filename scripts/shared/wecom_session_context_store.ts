import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type JsonObject } from "./zentao_client";

export type ContextEntityName = "product" | "project" | "execution" | "testtask" | "story" | "task" | "bug" | "release" | "case" | "run";

export interface ContextCandidate {
  id: string;
  name?: string;
}

export interface WecomContextualCandidateSuggestion {
  entity: ContextEntityName;
  label: string;
  candidates: ContextCandidate[];
}

export interface WecomSessionContext {
  userid: string;
  updatedAt: number;
  lastIntent?: string;
  entities: Partial<Record<ContextEntityName, string>>;
  candidates: Partial<Record<ContextEntityName, ContextCandidate[]>>;
}

interface ResolveArgsInput {
  userid: string;
  text: string;
  intent: string;
  requiredArgs: string[];
  requiredArgsAny: string[];
  args: Record<string, string>;
}

interface SaveContextInput {
  userid: string;
  text: string;
  intent: string;
  args: Record<string, string>;
  result: JsonObject;
}

const STORE_DIR = path.resolve(__dirname, "../../tmp/wecom-session-context");
const EXPIRY_MS = 10 * 60 * 1000;
const KNOWN_ENTITIES: ContextEntityName[] = ["product", "project", "execution", "testtask", "story", "task", "bug", "release", "case", "run"];
const KNOWN_ENTITY_SET = new Set<string>(KNOWN_ENTITIES);
const ROUTE_CANDIDATE_ENTITY: Partial<Record<string, ContextEntityName>> = {
  "query-products": "product",
  "query-projects": "project",
  "query-executions": "execution",
  "query-testtasks": "testtask",
  "query-product-stories": "story",
  "query-execution-stories": "story",
  "query-execution-tasks": "task",
  "query-my-tasks": "task",
  "query-my-bugs": "bug",
  "query-releases": "release",
  "query-testcases": "case",
  "query-testtask-cases": "run",
};
const ENTITY_LABELS: Record<ContextEntityName, string> = {
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
const ENTITY_RESULT_KEYS: Record<ContextEntityName, string[]> = {
  product: ["product", "product_id"],
  project: ["project", "project_id"],
  execution: ["execution", "execution_id"],
  testtask: ["testtask", "testtask_id"],
  story: ["story", "story_id"],
  task: ["task", "task_id"],
  bug: ["bug", "bug_id"],
  release: ["release", "release_id"],
  case: ["case", "case_id"],
  run: ["run"],
};
const ENTITY_REFERENCE_PATTERNS: Record<ContextEntityName, RegExp[]> = {
  product: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)产品/u],
  project: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)项目/u],
  execution: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:迭代|执行)/u],
  testtask: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:测试单|测试任务)/u],
  story: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:需求|story)/iu],
  task: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)任务/u],
  bug: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:bug|缺陷)/iu],
  release: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:发布|版本)/u],
  case: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:用例|case)/iu],
  run: [/(?:这个|该|当前|刚才(?:那个)?|上面(?:那个)?|上一个|最近(?:那个)?)(?:执行记录|run|执行结果)/iu],
};
const CHINESE_NUMBER_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function sanitizeUserid(userid: string): string {
  return userid.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function getStoreFile(userid: string): string {
  return path.join(STORE_DIR, `${sanitizeUserid(userid)}.json`);
}

function normalizeEntityId(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return undefined;
  }

  const numericMatch = normalized.match(/\d+/u);
  return numericMatch?.[0];
}

function normalizeCandidateName(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’`~\-_/\\|]+/gu, "")
    .replace(/\s+/gu, "");
}

function parseChineseOrdinal(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  if (/^\d+$/u.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (normalized === "十") {
    return 10;
  }
  if (normalized.length === 2 && normalized.startsWith("十")) {
    const value = CHINESE_NUMBER_MAP[normalized.slice(1)];
    return value ? 10 + value : null;
  }
  return CHINESE_NUMBER_MAP[normalized] ?? null;
}

function parseIndexedSelection(text: string, entity: ContextEntityName, maxCount: number): number | null {
  const label = ENTITY_LABELS[entity];
  const patterns = [
    new RegExp(`第\\s*([0-9一二两三四五六七八九十]+)\\s*个?${label}`, "iu"),
    new RegExp(`${label}\\s*第\\s*([0-9一二两三四五六七八九十]+)\\s*个?`, "iu"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const parsed = parseChineseOrdinal(match[1]);
    if (!parsed || parsed < 1 || parsed > maxCount) {
      return null;
    }
    return parsed - 1;
  }

  return null;
}

function readContext(userid: string): WecomSessionContext | null {
  ensureStoreDir();
  const storeFile = getStoreFile(userid.trim());
  if (!existsSync(storeFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(storeFile, "utf8")) as WecomSessionContext;
    if (!parsed || typeof parsed !== "object" || !parsed.updatedAt || Date.now() - parsed.updatedAt > EXPIRY_MS) {
      rmSync(storeFile, { force: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeContext(context: WecomSessionContext): void {
  ensureStoreDir();
  writeFileSync(getStoreFile(context.userid), JSON.stringify(context, null, 2), "utf8");
}

function isLowRiskIntent(intent: string): boolean {
  return intent.startsWith("query-");
}

function hasExplicitReference(text: string, entity: ContextEntityName): boolean {
  return ENTITY_REFERENCE_PATTERNS[entity].some((pattern) => pattern.test(text));
}

function findNamedCandidate(text: string, candidates: ContextCandidate[]): ContextCandidate | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }

  const matched = candidates.filter((candidate) => {
    const normalizedName = normalizeText(candidate.name ?? "");
    return normalizedName.length >= 2 && normalizedText.includes(normalizedName);
  });

  return matched.length === 1 ? matched[0] : null;
}

function pickEntityFromContext(input: {
  text: string;
  intent: string;
  entity: ContextEntityName;
  context: WecomSessionContext;
}): string | undefined {
  const candidates = input.context.candidates[input.entity] ?? [];
  const indexedSelection = parseIndexedSelection(input.text, input.entity, candidates.length);
  if (indexedSelection !== null) {
    return candidates[indexedSelection]?.id;
  }

  const namedCandidate = findNamedCandidate(input.text, candidates);
  if (namedCandidate) {
    return namedCandidate.id;
  }

  const explicitReference = hasExplicitReference(input.text, input.entity);
  if (explicitReference) {
    if (input.context.entities[input.entity]) {
      return input.context.entities[input.entity];
    }
    if (candidates.length === 1) {
      return candidates[0].id;
    }
    return undefined;
  }

  if (isLowRiskIntent(input.intent)) {
    if (input.context.entities[input.entity]) {
      return input.context.entities[input.entity];
    }
    if (candidates.length === 1) {
      return candidates[0].id;
    }
  }

  return undefined;
}

function extractResultCandidates(result: JsonObject): ContextCandidate[] {
  if (!Array.isArray(result.items)) {
    return [];
  }

  return result.items
    .filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      id: normalizeEntityId(item.id) ?? "",
      name: normalizeCandidateName(item.name ?? item.title),
    }))
    .filter((item) => item.id)
    .slice(0, 10);
}

function extractEntityFromResult(result: JsonObject, entity: ContextEntityName): string | undefined {
  for (const key of ENTITY_RESULT_KEYS[entity]) {
    const value = normalizeEntityId(result[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function mergeEntityContext(context: WecomSessionContext, entity: ContextEntityName, value: string | undefined): void {
  if (value) {
    context.entities[entity] = value;
  }
}

function collectContextualCandidateSuggestions(input: {
  context: WecomSessionContext;
  requiredArgsAny: string[];
  missingArgs: string[];
}): WecomContextualCandidateSuggestion[] {
  const suggestions: WecomContextualCandidateSuggestion[] = [];
  const renderedEntities = new Set<ContextEntityName>();

  for (const missingArg of input.missingArgs) {
    if (!KNOWN_ENTITY_SET.has(missingArg)) {
      continue;
    }
    const entity = missingArg as ContextEntityName;
    const candidates = input.context.candidates[entity] ?? [];
    if (candidates.length === 0) {
      continue;
    }
    renderedEntities.add(entity);
    suggestions.push({
      entity,
      label: ENTITY_LABELS[entity],
      candidates: candidates.slice(0, 5),
    });
  }

  if (suggestions.length === 0 && input.requiredArgsAny.length > 0) {
    for (const argName of input.requiredArgsAny) {
      if (!KNOWN_ENTITY_SET.has(argName)) {
        continue;
      }
      const entity = argName as ContextEntityName;
      if (renderedEntities.has(entity)) {
        continue;
      }
      const candidates = input.context.candidates[entity] ?? [];
      if (candidates.length === 0) {
        continue;
      }
      suggestions.push({
        entity,
        label: ENTITY_LABELS[entity],
        candidates: candidates.slice(0, 5),
      });
      break;
    }
  }

  return suggestions;
}

export function loadWecomSessionContext(userid: string): WecomSessionContext | null {
  return readContext(userid);
}

export function resolveRouteArgsFromWecomContext(input: ResolveArgsInput): Record<string, string> {
  const context = readContext(input.userid);
  if (!context) {
    return input.args;
  }

  const resolvedArgs = { ...input.args };
  for (const name of input.requiredArgs) {
    if (resolvedArgs[name] || !KNOWN_ENTITY_SET.has(name)) {
      continue;
    }
    const entity = name as ContextEntityName;
    const resolved = pickEntityFromContext({
      text: input.text,
      intent: input.intent,
      entity,
      context,
    });
    if (resolved) {
      resolvedArgs[name] = resolved;
    }
  }

  if (input.requiredArgsAny.length > 0 && !input.requiredArgsAny.some((name) => Boolean(resolvedArgs[name]))) {
    for (const name of input.requiredArgsAny) {
      if (!KNOWN_ENTITY_SET.has(name)) {
        continue;
      }
      const entity = name as ContextEntityName;
      const resolved = pickEntityFromContext({
        text: input.text,
        intent: input.intent,
        entity,
        context,
      });
      if (resolved) {
        resolvedArgs[name] = resolved;
        break;
      }
    }
  }

  return resolvedArgs;
}

export function buildWecomContextualMissingHint(input: {
  userid: string;
  requiredArgsAny: string[];
  missingArgs: string[];
}): string | null {
  const context = readContext(input.userid);
  if (!context) {
    return null;
  }

  const suggestions = collectContextualCandidateSuggestions({
    context,
    requiredArgsAny: input.requiredArgsAny,
    missingArgs: input.missingArgs,
  });
  if (suggestions.length === 0) {
    return null;
  }

  const lines: string[] = [];
  for (const suggestion of suggestions) {
    lines.push(`你最近查到这些${suggestion.label}，可直接回复“${suggestion.label}ID”或“第1个${suggestion.label}”：`);
    for (const [index, candidate] of suggestion.candidates.entries()) {
      lines.push(`${index + 1}. #${candidate.id} ${candidate.name ?? ""}`.trimEnd());
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

export function getWecomContextualCandidateSuggestions(input: {
  userid: string;
  requiredArgsAny: string[];
  missingArgs: string[];
}): WecomContextualCandidateSuggestion[] {
  const context = readContext(input.userid);
  if (!context) {
    return [];
  }

  return collectContextualCandidateSuggestions({
    context,
    requiredArgsAny: input.requiredArgsAny,
    missingArgs: input.missingArgs,
  });
}

export function saveWecomSessionContextFromResult(input: SaveContextInput): void {
  const userid = input.userid.trim();
  if (!userid) {
    return;
  }

  const context = readContext(userid) ?? {
    userid,
    updatedAt: Date.now(),
    entities: {},
    candidates: {},
  };

  context.updatedAt = Date.now();
  context.lastIntent = input.intent;

  for (const entity of KNOWN_ENTITIES) {
    mergeEntityContext(context, entity, normalizeEntityId(input.args[entity]));
  }

  for (const entity of KNOWN_ENTITIES) {
    mergeEntityContext(context, entity, extractEntityFromResult(input.result, entity));
  }

  const candidateEntity = ROUTE_CANDIDATE_ENTITY[input.intent];
  if (candidateEntity) {
    const candidates = extractResultCandidates(input.result);
    context.candidates[candidateEntity] = candidates;
    if (candidates.length === 1) {
      context.entities[candidateEntity] = candidates[0].id;
    }

    const namedCandidate = findNamedCandidate(input.text, candidates);
    if (namedCandidate) {
      context.entities[candidateEntity] = namedCandidate.id;
    }
  }

  writeContext(context);
}

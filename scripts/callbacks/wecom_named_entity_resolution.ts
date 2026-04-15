import { type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { loadWecomSessionContext, type ContextCandidate, type ContextEntityName } from "../shared/wecom_session_context_store";
import { isPositiveIntegerArg, resolveProductArg, type ProductMatchCandidate } from "./product_arg_resolution";
import { ENTITY_LABELS, buildRouteSelectionReply } from "./wecom_route_selection";
import type { IntentRoute } from "./wecom_route_resolver";

export interface NamedEntityResolutionResult {
  args: Record<string, string>;
  reply?: JsonObject;
}

interface NamedEntityResolutionOptions {
  route: IntentRoute;
  text: string;
  userid: string;
  args: Record<string, string>;
  entity: ContextEntityName;
  argName: string;
  lookupMatches: (lookupText: string, args: Record<string, string>) => Promise<ContextCandidate[]>;
}

const ENTITY_ID_HINTS: Partial<Record<ContextEntityName, string[]>> = {
  product: ["产品", "product"],
  project: ["项目", "project"],
  execution: ["执行", "迭代", "execution", "sprint"],
  testtask: ["测试单", "测试任务", "testtask"],
  story: ["需求", "story"],
  task: ["任务", "task"],
  bug: ["bug", "缺陷"],
  release: ["发布", "版本", "release"],
  case: ["用例", "case"],
  run: ["run", "执行记录"],
};

function extractArrayObjects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
}

function extractObjectItems(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return extractArrayObjects(value);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
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

function normalizeEntityLookupText(text: string): string {
  return normalizeWecomText(text).replace(/\s+/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExplicitEntityIdReference(text: string, entity: ContextEntityName, rawValue: string): boolean {
  const hints = ENTITY_ID_HINTS[entity] ?? [];
  if (hints.some((hint) => new RegExp(`${escapeRegExp(hint)}\\s*[#：:=-]?\\s*${escapeRegExp(rawValue)}(?!\\d)`, "iu").test(text))) {
    return true;
  }

  return false;
}

function shouldTreatNumericArgAsExplicitId(text: string, _route: IntentRoute, entity: ContextEntityName, rawValue: string): boolean {
  return hasExplicitEntityIdReference(text, entity, rawValue);
}

function routeNeedsArg(route: IntentRoute, argName: string): boolean {
  return route.requiredArgs.includes(argName) || route.requiredArgsAny.includes(argName);
}

function routeSupportsArg(route: IntentRoute, argName: string): boolean {
  return routeNeedsArg(route, argName) || route.optionalArgs.includes(argName);
}

function buildMatchCandidates(items: JsonObject[], nameKeys: string[]): ContextCandidate[] {
  const seen = new Set<string>();
  const candidates: ContextCandidate[] = [];

  for (const item of items) {
    const id = String(item.id ?? "").trim();
    if (!id || seen.has(id)) {
      continue;
    }

    const name = nameKeys
      .map((key) => String(item[key] ?? "").trim())
      .find(Boolean);
    if (!name) {
      continue;
    }

    seen.add(id);
    candidates.push({ id, name });
  }

  return candidates;
}

function filterCandidatesByText(text: string, candidates: ContextCandidate[]): ContextCandidate[] {
  const normalizedText = normalizeEntityLookupText(text);
  if (!normalizedText) {
    return [];
  }

  const matches = candidates.filter((candidate) => {
    const normalizedName = normalizeEntityLookupText(candidate.name ?? "");
    return normalizedName.length >= 2 && normalizedText.includes(normalizedName);
  });

  if (matches.length <= 1) {
    return matches;
  }

  const sorted = [...matches].sort((left, right) => (right.name?.length ?? 0) - (left.name?.length ?? 0));
  if ((sorted[0].name?.length ?? 0) > (sorted[1].name?.length ?? 0)) {
    return [sorted[0]];
  }

  return sorted;
}

function toPositiveId(value: string | undefined): number | null {
  if (!isPositiveIntegerArg(value)) {
    return null;
  }
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  const parsed = Number.parseInt(normalizedValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function resolveExecutionContext(userid: string, executionId: number): Promise<{ productId?: string; projectId?: string }> {
  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/execution-view-${executionId}.json`);
  const execution = typeof data.execution === "object" && data.execution !== null && !Array.isArray(data.execution)
    ? data.execution as JsonObject
    : null;
  if (!execution) {
    return {};
  }

  const productId = String(execution.productID ?? execution.product ?? "").trim();
  const projectId = String(execution.project ?? execution.parent ?? "").trim();
  return {
    productId: isPositiveIntegerArg(productId) ? productId : undefined,
    projectId: isPositiveIntegerArg(projectId) ? projectId : undefined,
  };
}

function readContextEntityId(userid: string, entity: ContextEntityName): string | undefined {
  const context = loadWecomSessionContext(userid);
  const value = context?.entities[entity];
  return isPositiveIntegerArg(value) ? value : undefined;
}

function resolveScopedExecutionId(userid: string, args: Record<string, string>): number | null {
  const directExecutionId = toPositiveId(args.execution);
  if (directExecutionId) {
    return directExecutionId;
  }

  return toPositiveId(readContextEntityId(userid, "execution"));
}

async function resolveScopedProductId(userid: string, args: Record<string, string>): Promise<string | undefined> {
  if (isPositiveIntegerArg(args.product)) {
    return args.product.trim();
  }

  const executionId = resolveScopedExecutionId(userid, args);
  if (executionId) {
    const context = await resolveExecutionContext(userid, executionId);
    return context.productId;
  }

  return readContextEntityId(userid, "product");
}

async function resolveScopedProjectId(userid: string, args: Record<string, string>): Promise<string | undefined> {
  if (isPositiveIntegerArg(args.project)) {
    return args.project.trim();
  }

  const executionId = resolveScopedExecutionId(userid, args);
  if (executionId) {
    const context = await resolveExecutionContext(userid, executionId);
    return context.projectId;
  }

  return readContextEntityId(userid, "project");
}

async function findMatchingProductsByName(text: string, userid: string): Promise<ProductMatchCandidate[]> {
  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData("/product-all.json");
  const items = extractArrayObjects((data as JsonObject).productStats);
  return filterCandidatesByText(text, buildMatchCandidates(items, ["name"])) as ProductMatchCandidate[];
}

async function findMatchingStoriesByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const client = new ZentaoClient({ userid });
  const executionId = resolveScopedExecutionId(userid, args);
  if (executionId) {
    const data = await client.getWebJsonViewData(`/execution-story-${executionId}.json`);
    return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.stories), ["title", "name"]));
  }

  const productId = await resolveScopedProductId(userid, args);
  if (!productId) {
    return [];
  }

  const data = await client.getWebJsonViewData(`/story-browse-${productId}-all-0-id_desc-0-100-1.json`);
  return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.stories), ["title", "name"]));
}

async function findMatchingTasksByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const executionId = resolveScopedExecutionId(userid, args);
  if (!executionId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/execution-task-${executionId}.json`);
  return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.tasks), ["name", "title"]));
}

async function findMatchingCasesByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const productId = await resolveScopedProductId(userid, args);
  if (!productId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/testcase-browse-${productId}-all.json`);
  return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.cases), ["title", "name"]));
}

async function findMatchingTesttasksByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const executionId = resolveScopedExecutionId(userid, args);
  const productId = await resolveScopedProductId(userid, args);
  const projectId = await resolveScopedProjectId(userid, args);
  const browseProductId = productId ?? "0";
  if (!productId && !executionId && !projectId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/testtask-browse-${browseProductId}-0-all-id_desc-0-100-1.json`);
  let items = extractObjectItems(data.tasks);

  if (productId) {
    items = items.filter((item) => String(item.product ?? "").trim() === productId);
  }
  if (executionId) {
    items = items.filter((item) => String(item.execution ?? "").trim() === String(executionId));
  }
  if (projectId) {
    items = items.filter((item) => String(item.project ?? "").trim() === projectId);
  }

  return filterCandidatesByText(text, buildMatchCandidates(items, ["name", "title"]));
}

async function findMatchingBugsByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const productId = await resolveScopedProductId(userid, args);
  if (!productId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/bug-browse-${productId}-all-0-id_desc-0-100-1.json`);
  return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.bugs), ["title", "name"]));
}

async function findMatchingReleasesByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const productId = await resolveScopedProductId(userid, args);
  if (!productId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/release-browse-${productId}-all.json`);
  return filterCandidatesByText(text, buildMatchCandidates(extractObjectItems(data.releases), ["name", "title"]));
}

async function findMatchingRunsByName(text: string, userid: string, args: Record<string, string>): Promise<ContextCandidate[]> {
  const testtaskId = toPositiveId(args.testtask) ?? toPositiveId(readContextEntityId(userid, "testtask"));
  if (!testtaskId) {
    return [];
  }

  const client = new ZentaoClient({ userid });
  const data = await client.getWebJsonViewData(`/testtask-cases-${testtaskId}-all-0-id_desc-0-100-1.json`);
  let items = extractObjectItems(data.runs);

  if (isPositiveIntegerArg(args.case)) {
    const matchedByCase = items.filter((item) => String(item.case ?? "").trim() === args.case.trim());
    if (matchedByCase.length > 0) {
      if (matchedByCase.length === 1) {
        return buildMatchCandidates(matchedByCase, ["title", "name"]);
      }
      items = matchedByCase;
    }
  }

  return filterCandidatesByText(text, buildMatchCandidates(items, ["title", "name"]));
}

async function resolveNamedEntityArg(options: NamedEntityResolutionOptions): Promise<NamedEntityResolutionResult> {
  const rawValue = typeof options.args[options.argName] === "string" ? options.args[options.argName].trim() : "";
  const lookupText = rawValue && !options.text.includes(rawValue)
    ? `${options.text} ${rawValue}`
    : options.text;

  if (isPositiveIntegerArg(rawValue) && shouldTreatNumericArgAsExplicitId(options.text, options.route, options.entity, rawValue)) {
    return {
      args: {
        ...options.args,
        [options.argName]: rawValue,
      },
    };
  }

  const matches = await options.lookupMatches(lookupText, options.args);

  if (matches.length === 1) {
    return {
      args: {
        ...options.args,
        [options.argName]: matches[0].id,
      },
    };
  }

  if (matches.length > 1) {
    return {
      args: options.args,
      reply: buildRouteSelectionReply({
        userid: options.userid,
        route: options.route,
        trigger: `named-${options.entity}-lookup`,
        originalText: options.text,
        args: options.args,
        entity: options.entity,
        candidates: matches,
        intro: `你提到的${ENTITY_LABELS[options.entity]}匹配到了多个结果，请回复对应编号继续：`,
      }),
    };
  }

  if (rawValue) {
    const nextArgs = { ...options.args };
    delete nextArgs[options.argName];
    return { args: nextArgs };
  }

  return { args: options.args };
}

function normalizeEntityAliases(route: IntentRoute, args: Record<string, string>): Record<string, string> {
  const normalized = { ...args };

  if (route.intent === "link-execution-stories" && !normalized.story && normalized["story-ids"]) {
    normalized.story = normalized["story-ids"];
  }
  if (route.intent === "link-release-items") {
    if (!normalized.story && normalized["story-ids"]) {
      normalized.story = normalized["story-ids"];
    }
    if (!normalized.bug && normalized["bug-ids"]) {
      normalized.bug = normalized["bug-ids"];
    }
  }
  if (route.intent === "link-testtask-cases" && !normalized.case && normalized.cases) {
    normalized.case = normalized.cases;
  }

  return normalized;
}

export async function resolveNamedProductArg(
  route: IntentRoute,
  text: string,
  userid: string,
  args: Record<string, string>,
): Promise<NamedEntityResolutionResult> {
  const resolved = await resolveProductArg({
    routeNeedsProduct: routeNeedsArg(route, "product"),
    text,
    args,
    lookupMatches: async (lookupText) => {
      const matches = await findMatchingProductsByName(lookupText, userid);
      return matches
        .filter((item): item is { id: string; name: string } => typeof item.id === "string" && typeof item.name === "string")
        .map((item) => ({ id: item.id, name: item.name }));
    },
  });

  if (resolved.status === "resolved") {
    return {
      args: resolved.args,
    };
  }

  const rawProduct = typeof args.product === "string" ? args.product.trim() : "";
  if (isPositiveIntegerArg(rawProduct) && !shouldTreatNumericArgAsExplicitId(text, route, "product", rawProduct)) {
    const matches = await findMatchingProductsByName(text, userid);
    if (matches.length === 1) {
      return {
        args: {
          ...args,
          product: matches[0].id,
        },
      };
    }
    if (matches.length > 1) {
      return {
        args,
        reply: buildRouteSelectionReply({
          userid,
          route,
          trigger: "named-product-lookup",
          originalText: text,
          args,
          entity: "product",
          candidates: matches,
          intro: "你提到的产品名匹配到了多个产品，请回复对应编号继续：",
        }),
      };
    }
  }

  if (resolved.status === "ambiguous" && resolved.matches) {
    return {
      args: resolved.args,
      reply: buildRouteSelectionReply({
        userid,
        route,
        trigger: "named-product-lookup",
        originalText: text,
        args: resolved.args,
        entity: "product",
        candidates: resolved.matches,
        intro: "你提到的产品名匹配到了多个产品，请回复对应编号继续：",
      }),
    };
  }

  return { args: resolved.args };
}

export async function resolveNamedEntityArgs(
  route: IntentRoute,
  text: string,
  userid: string,
  args: Record<string, string>,
): Promise<NamedEntityResolutionResult> {
  let resolvedArgs = normalizeEntityAliases(route, args);
  const resolvers: Array<{
    entity: ContextEntityName;
    argName: string;
    lookupMatches: (lookupText: string, currentArgs: Record<string, string>) => Promise<ContextCandidate[]>;
  }> = [
    { entity: "testtask", argName: "testtask", lookupMatches: (lookupText, currentArgs) => findMatchingTesttasksByName(lookupText, userid, currentArgs) },
    { entity: "story", argName: "story", lookupMatches: (lookupText, currentArgs) => findMatchingStoriesByName(lookupText, userid, currentArgs) },
    { entity: "task", argName: "task", lookupMatches: (lookupText, currentArgs) => findMatchingTasksByName(lookupText, userid, currentArgs) },
    { entity: "case", argName: "case", lookupMatches: (lookupText, currentArgs) => findMatchingCasesByName(lookupText, userid, currentArgs) },
    { entity: "bug", argName: "bug", lookupMatches: (lookupText, currentArgs) => findMatchingBugsByName(lookupText, userid, currentArgs) },
    { entity: "release", argName: "release", lookupMatches: (lookupText, currentArgs) => findMatchingReleasesByName(lookupText, userid, currentArgs) },
    { entity: "run", argName: "run", lookupMatches: (lookupText, currentArgs) => findMatchingRunsByName(lookupText, userid, currentArgs) },
  ];

  for (const resolver of resolvers) {
    if (!routeSupportsArg(route, resolver.argName) && !resolvedArgs[resolver.argName]) {
      continue;
    }

    const resolved = await resolveNamedEntityArg({
      route,
      text,
      userid,
      args: resolvedArgs,
      entity: resolver.entity,
      argName: resolver.argName,
      lookupMatches: resolver.lookupMatches,
    });
    if (resolved.reply) {
      return resolved;
    }
    resolvedArgs = resolved.args;
  }

  return { args: resolvedArgs };
}

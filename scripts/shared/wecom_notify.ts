import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { type JsonObject, type JsonValue, ZentaoClient } from "./zentao_client";
import { createNotificationAuditId, toAuditArray, writeNotificationAudit } from "./notification_audit";
import { WecomClient } from "./wecom_client";

type SupportedObjectType = "story" | "bug" | "task";
type SupportedEventType = "status_changed" | "assignee_changed";

interface NotifyResult extends JsonObject {
  ok: boolean;
  enabled: boolean;
  object_type: SupportedObjectType;
  event_type: SupportedEventType;
  rule_code?: string;
  template?: string;
  sent_to?: string[];
  skipped_reason?: string;
  wecom_response?: JsonObject;
}

interface BaseNotifyInput {
  operatorUserid?: string;
  oldStatus?: string;
  newStatus?: string;
  oldAssignee?: string;
  newAssignee?: string;
  comment?: string;
}

interface RuleWhen extends JsonObject {
  always?: boolean;
  field?: string;
  equals?: JsonValue;
  in?: JsonValue[];
  all?: RuleWhen[];
  any?: RuleWhen[];
  not?: RuleWhen;
  ref?: string;
  field_changed_in?: string[] | string;
}

interface NotificationRule extends JsonObject {
  rule_code: string;
  object_type: SupportedObjectType;
  event_type: SupportedEventType;
  when?: RuleWhen;
  template?: string;
  primary_receivers?: string[];
  cc_receivers?: string[];
}

interface NotificationRulesConfig extends JsonObject {
  defaults?: {
    exclude_operator?: boolean;
  };
  field_sets?: Record<string, string[]>;
  conditions?: Record<string, RuleWhen>;
  rules?: NotificationRule[];
}

interface NotificationTemplateDefinition extends JsonObject {
  title?: string;
  msgtype?: string;
  content?: string;
  template_card?: JsonObject;
}

interface NotificationTemplatesConfig extends JsonObject {
  defaults?: JsonObject;
  templates?: Record<string, NotificationTemplateDefinition>;
}

interface NotifyContext {
  object_type: SupportedObjectType;
  event_type: SupportedEventType;
  entity: JsonObject;
  operatorUserid?: string;
  change: {
    old_status_name?: string;
    new_status_name?: string;
    old_assignee_name?: string;
    new_assignee_name?: string;
    reason?: string;
    changed_fields_text?: string;
    old_priority?: string;
    new_priority?: string;
  };
  links: {
    story_detail?: string;
    bug_detail?: string;
    task_detail?: string;
  };
  extraReceivers?: {
    pm?: string[];
    requester?: string[];
    project_owner?: string[];
    tester?: string[];
    creator?: string[];
    current_assignee?: string[];
    old_assignee?: string[];
    new_assignee?: string[];
    related_story_owner?: string[];
    collaborators?: string[];
    next_dev?: string[];
    next_tester?: string[];
  };
}

interface ResolvedReceivers {
  receivers: string[];
  filteredOperator: boolean;
}

type ReceiverUseridResolver = (candidate: string) => Promise<string | undefined>;

const DOCS_DIR = resolveDocsDir();
const RULES_PATH = path.join(DOCS_DIR, "11-notification-rules-mvp.yaml");
const TEMPLATES_PATH = path.join(DOCS_DIR, "12-notification-template-cards-mvp.yaml");

let cachedRules: NotificationRulesConfig | null = null;
let cachedTemplates: NotificationTemplatesConfig | null = null;

function resolveDocsDir(): string {
  const candidates = [
    process.env.OPENCLAW_NOTIFICATION_DOCS_DIR,
    path.resolve(process.cwd(), "docs/wecom-zentao"),
    path.resolve(__dirname, "../../docs/wecom-zentao"),
    path.resolve(__dirname, "../../../docs/wecom-zentao"),
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "11-notification-rules-mvp.yaml"))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "docs/wecom-zentao");
}

export async function notifyTaskStatusChanged(input: BaseNotifyInput & { taskId: number }): Promise<NotifyResult> {
  const client = new ZentaoClient({ userid: input.operatorUserid });
  const viewData = await client.getWebJsonViewData(`/task-view-${input.taskId}.json`);
  const task = asObject(viewData.task);
  if (!task) {
    return buildSkipped("task", "status_changed", `task ${input.taskId} not found`);
  }

  const context = await buildTaskContext(client, task, input.taskId, input);
  return dispatchNotification(context);
}

export async function notifyBugStatusChanged(input: BaseNotifyInput & { bugId: number }): Promise<NotifyResult> {
  const client = new ZentaoClient({ userid: input.operatorUserid });
  const viewData = await client.getWebJsonViewData(`/bug-view-${input.bugId}.json`);
  const bug = asObject(viewData.bug ?? viewData);
  if (!bug) {
    return buildSkipped("bug", "status_changed", `bug ${input.bugId} not found`);
  }

  const context = await buildBugContext(client, bug, input.bugId, input);
  return dispatchNotification(context);
}

export async function notifyBugAssigned(input: BaseNotifyInput & { bugId: number; newAssignee: string }): Promise<NotifyResult> {
  const client = new ZentaoClient({ userid: input.operatorUserid });
  const viewData = await client.getWebJsonViewData(`/bug-view-${input.bugId}.json`);
  const bug = asObject(viewData.bug ?? viewData);
  if (!bug) {
    return buildSkipped("bug", "assignee_changed", `bug ${input.bugId} not found`);
  }

  const context = await buildBugContext(client, bug, input.bugId, {
    ...input,
    newStatus: getString(bug, "status"),
  }, "assignee_changed");
  return dispatchNotification(context);
}

export async function notifyStoryStatusChanged(input: BaseNotifyInput & { storyId: number; closedReason?: string }): Promise<NotifyResult> {
  const client = new ZentaoClient({ userid: input.operatorUserid });
  const viewData = await client.getWebJsonViewData(`/story-view-${input.storyId}.json`);
  const story = asObject(viewData.story ?? viewData);
  if (!story) {
    return buildSkipped("story", "status_changed", `story ${input.storyId} not found`);
  }

  const context = await buildStoryContext(client, story, input.storyId, input, input.closedReason);
  return dispatchNotification(context);
}

async function dispatchNotification(context: NotifyContext): Promise<NotifyResult> {
  const rulesConfig = loadRulesConfig();
  const templatesConfig = loadTemplatesConfig();
  const rule = (rulesConfig.rules ?? []).find((item) => item.object_type === context.object_type && item.event_type === context.event_type && matchesWhen(item.when, context, rulesConfig));
  if (!rule) {
    const result = buildSkipped(context.object_type, context.event_type, "no matched notification rule");
    writeAudit(context, result);
    return Promise.resolve(result);
  }

  const template = templatesConfig.templates?.[rule.template ?? ""];
  if (!template) {
    const result = {
      ...buildSkipped(context.object_type, context.event_type, `template '${rule.template ?? ""}' not found`),
      rule_code: rule.rule_code,
    };
    writeAudit(context, result);
    return Promise.resolve(result);
  }

  const excludeOperator = rulesConfig.defaults?.exclude_operator !== false;
  const resolvedReceivers = await resolveReceivers(
    rule,
    context,
    excludeOperator,
    createReceiverUseridResolver(context.operatorUserid),
  );
  const receivers = resolvedReceivers.receivers;
  if (receivers.length === 0) {
    const reason = resolvedReceivers.filteredOperator
      ? "no receivers resolved (operator excluded)"
      : "no receivers resolved";
    const result = {
      ...buildSkipped(context.object_type, context.event_type, reason),
      rule_code: rule.rule_code,
      template: rule.template,
    };
    writeAudit(context, result);
    return result;
  }

  const templateData = buildTemplateData(context);
  const msgtype = typeof template.msgtype === "string" && template.msgtype.trim()
    ? template.msgtype.trim()
    : "markdown";

  let sendPromise: Promise<JsonObject>;
  if (msgtype === "template_card") {
    if (!template.template_card) {
      const result = {
        ...buildSkipped(context.object_type, context.event_type, `template '${rule.template ?? ""}' missing template_card payload`),
        rule_code: rule.rule_code,
        template: rule.template,
      };
      writeAudit(context, result);
      return result;
    }
    const renderedCard = renderTemplateValue(template.template_card, templateData);
    if (!isJsonObject(renderedCard)) {
      const result = {
        ...buildSkipped(context.object_type, context.event_type, `template '${rule.template ?? ""}' rendered invalid template_card payload`),
        rule_code: rule.rule_code,
        template: rule.template,
      };
      writeAudit(context, result);
      return result;
    }
    sendPromise = new WecomClient().sendAppMessage({
      touser: receivers.join("|"),
      msgtype: "template_card",
      template_card: renderedCard,
      safe: 0,
    });
  } else {
    if (!template.content) {
      const result = {
        ...buildSkipped(context.object_type, context.event_type, `template '${rule.template ?? ""}' missing content`),
        rule_code: rule.rule_code,
        template: rule.template,
      };
      writeAudit(context, result);
      return result;
    }
    const content = renderTemplate(template.content, templateData);
    sendPromise = new WecomClient().sendMarkdownToUsers(receivers, content);
  }

  return sendPromise.then((response) => {
    const result: NotifyResult = {
      ok: true,
      enabled: true,
      object_type: context.object_type,
      event_type: context.event_type,
      rule_code: rule.rule_code,
      template: rule.template,
      sent_to: receivers,
      wecom_response: response,
    };
    writeAudit(context, result);
    return result;
  }).catch((error) => {
    const result: NotifyResult = {
      ok: false,
      enabled: true,
      object_type: context.object_type,
      event_type: context.event_type,
      rule_code: rule.rule_code,
      template: rule.template,
      sent_to: receivers,
      skipped_reason: error instanceof Error ? error.message : String(error),
    };
    writeAudit(context, result);
    return result;
  });
}

async function buildTaskContext(client: ZentaoClient, task: JsonObject, taskId: number, input: BaseNotifyInput): Promise<NotifyContext> {
  const relatedStory = await resolveLinkedStory(client, task.story);
  const affectStory = normalizePositiveNumber(task.story) !== undefined;
  const isKeyTask = isPriorityHigh(task.pri);
  const impactDev = collectUsers(
    ...getUserIds(task, "assignedTo"),
    ...getUserIds(relatedStory, "assignedTo"),
    ...getUserIds(relatedStory, "openedBy"),
  );
  const impactTester = collectUsers(
    ...getUserIds(task, "finishedBy"),
    ...getUserIds(task, "closedBy"),
    ...getUserIds(relatedStory, "reviewedBy"),
    ...getUserIds(relatedStory, "reviewer"),
  );
  const nextDev = resolveNextDevForTask(task, relatedStory, input);
  const nextTester = resolveNextTesterForTask(task, relatedStory, input);
  return {
    object_type: "task",
    event_type: "status_changed",
    entity: {
      ...task,
      affect_story: affectStory,
      is_key_task: isKeyTask,
    },
    operatorUserid: input.operatorUserid,
    change: {
      old_status_name: input.oldStatus,
      new_status_name: input.newStatus,
      reason: input.comment,
    },
    links: {
      task_detail: `${client.baseUrl}/task-view-${taskId}.html`,
    },
    extraReceivers: {
      creator: collectUsers(getString(task, "openedBy")),
      current_assignee: impactDev,
      tester: impactTester,
      pm: [],
      project_owner: [],
      collaborators: collectUsers(getString(task, "mailto")),
      related_story_owner: collectUsers(getString(relatedStory, "assignedTo"), getString(relatedStory, "openedBy")),
      next_dev: nextDev,
      next_tester: nextTester,
    },
  };
}

async function buildBugContext(client: ZentaoClient, bug: JsonObject, bugId: number, input: BaseNotifyInput, eventType: SupportedEventType = "status_changed"): Promise<NotifyContext> {
  const relatedStory = await resolveLinkedStory(client, bug.story);
  const impactDev = collectUsers(
    input.newAssignee,
    getString(bug, "assignedTo"),
    getString(relatedStory, "assignedTo"),
  );
  const impactTester = collectUsers(
    getString(bug, "resolvedBy"),
    getString(bug, "closedBy"),
    getString(relatedStory, "reviewedBy"),
    getString(relatedStory, "reviewer"),
    getString(bug, "openedBy"),
  );
  const nextDev = resolveNextDevForBug(bug, relatedStory, input, eventType);
  const nextTester = resolveNextTesterForBug(bug, relatedStory, input, eventType);
  return {
    object_type: "bug",
    event_type: eventType,
    entity: {
      ...bug,
      impact_version: isHighBug(bug),
    },
    operatorUserid: input.operatorUserid,
    change: {
      old_status_name: input.oldStatus,
      new_status_name: input.newStatus,
      old_assignee_name: input.oldAssignee,
      new_assignee_name: input.newAssignee,
      reason: input.comment,
      old_priority: stringifyOptional(bug.pri),
      new_priority: stringifyOptional(bug.pri),
    },
    links: {
      bug_detail: `${client.baseUrl}/bug-view-${bugId}.html`,
    },
    extraReceivers: {
      creator: collectUsers(getString(bug, "openedBy")),
      requester: collectUsers(getString(bug, "openedBy")),
      current_assignee: impactDev,
      old_assignee: collectUsers(input.oldAssignee),
      new_assignee: collectUsers(input.newAssignee),
      tester: impactTester,
      pm: [],
      project_owner: [],
      related_story_owner: collectUsers(getString(relatedStory, "assignedTo"), getString(relatedStory, "openedBy")),
      next_dev: nextDev.length > 0 ? nextDev : impactDev,
      next_tester: nextTester.length > 0 ? nextTester : impactTester,
    },
  };
}

async function buildStoryContext(client: ZentaoClient, story: JsonObject, storyId: number, input: BaseNotifyInput, closedReason?: string): Promise<NotifyContext> {
  const impactDev = collectUsers(...getUserIds(story, "assignedTo"), ...getUserIds(story, "openedBy"));
  const impactTester = collectUsers(...getUserIds(story, "reviewedBy"), ...getUserIds(story, "reviewer"), ...getUserIds(story, "closedBy"));
  const nextDev = resolveNextDevForStory(story, input);
  const nextTester = resolveNextTesterForStory(story, input);
  return {
    object_type: "story",
    event_type: "status_changed",
    entity: story,
    operatorUserid: input.operatorUserid,
    change: {
      old_status_name: input.oldStatus,
      new_status_name: input.newStatus,
      reason: closedReason ?? input.comment,
    },
    links: {
      story_detail: `${client.baseUrl}/story-view-${storyId}.html`,
    },
    extraReceivers: {
      creator: collectUsers(getString(story, "openedBy")),
      requester: collectUsers(getString(story, "openedBy")),
      current_assignee: impactDev,
      tester: impactTester,
      pm: [],
      project_owner: [],
      next_dev: nextDev.length > 0 ? nextDev : impactDev,
      next_tester: nextTester.length > 0 ? nextTester : impactTester,
    },
  };
}

async function resolveLinkedStory(client: ZentaoClient, storyValue: JsonValue | undefined): Promise<JsonObject> {
  const storyId = normalizePositiveNumber(storyValue);
  if (!storyId) {
    return {};
  }
  try {
    const data = await client.getWebJsonViewData(`/story-view-${storyId}.json`);
    return asObject(data.story ?? data) ?? {};
  } catch {
    return {};
  }
}

function loadRulesConfig(): NotificationRulesConfig {
  if (!cachedRules) {
    cachedRules = parseYamlFile<NotificationRulesConfig>(RULES_PATH);
  }
  return cachedRules;
}

function loadTemplatesConfig(): NotificationTemplatesConfig {
  if (!cachedTemplates) {
    cachedTemplates = parseYamlFile<NotificationTemplatesConfig>(TEMPLATES_PATH);
  }
  return cachedTemplates;
}

function parseYamlFile<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`Notification config file not found: ${filePath}`);
  }
  return YAML.parse(readFileSync(filePath, "utf8")) as T;
}

function matchesWhen(when: RuleWhen | undefined, context: NotifyContext, config: NotificationRulesConfig): boolean {
  if (!when || when.always === true) {
    return true;
  }
  if (when.ref && config.conditions?.[when.ref]) {
    return matchesWhen(config.conditions[when.ref], context, config);
  }
  if (when.not) {
    return !matchesWhen(when.not, context, config);
  }
  if (Array.isArray(when.all)) {
    return when.all.every((item) => matchesWhen(item, context, config));
  }
  if (Array.isArray(when.any)) {
    return when.any.some((item) => matchesWhen(item, context, config));
  }
  if (when.field_changed_in) {
    const changedFields = normalizeStringArray(context.change.changed_fields_text ? context.change.changed_fields_text.split(",") : []);
    const expected = Array.isArray(when.field_changed_in)
      ? when.field_changed_in
      : config.field_sets?.[when.field_changed_in] ?? [when.field_changed_in];
    return expected.some((item) => changedFields.includes(item));
  }
  if (when.field) {
    const actual = readFieldValue(context, when.field);
    if (Array.isArray(when.in)) {
      return when.in.map((item) => stringifyOptional(item)).includes(stringifyOptional(actual));
    }
    if (when.equals !== undefined) {
      return stringifyOptional(actual) === stringifyOptional(when.equals);
    }
  }
  return false;
}

async function resolveReceivers(
  rule: NotificationRule,
  context: NotifyContext,
  excludeOperator: boolean,
  resolveUserid: ReceiverUseridResolver,
): Promise<ResolvedReceivers> {
  const users = resolveRoleUsers(rule.primary_receivers ?? [], context);
  const resolvedUsers = await Promise.all(users.map((item) => resolveUserid(item)));
  const operator = excludeOperator ? await resolveUserid(context.operatorUserid ?? "") : undefined;
  const receivers = Array.from(new Set(resolvedUsers.filter((item): item is string => Boolean(item) && item !== operator)));
  return {
    receivers,
    filteredOperator: Boolean(operator) && resolvedUsers.some((item) => item === operator),
  };
}

function resolveRoleUsers(roles: string[], context: NotifyContext): string[] {
  return roles.flatMap((role) => context.extraReceivers?.[role as keyof NonNullable<NotifyContext["extraReceivers"]>] ?? []);
}

function buildTemplateData(context: NotifyContext): JsonObject {
  const entity = context.entity;
  return {
    operator: {
      name: context.operatorUserid ?? "-",
    },
    event: {
      time: new Date().toISOString().replace("T", " ").slice(0, 19),
    },
    change: context.change,
    links: context.links,
    story: {
      id: entity.id,
      title: entity.title ?? entity.name,
      pri: entity.pri,
      assigned_to_name: entity.assignedTo,
      requester_name: entity.openedBy,
      tester_name: entity.reviewedBy ?? entity.closedBy,
      summary: entity.spec ?? entity.desc ?? "",
      module_name: entity.module,
    },
    bug: {
      id: entity.id,
      title: entity.title,
      severity: entity.severity,
      pri: entity.pri,
      assigned_to_name: entity.assignedTo,
      opened_by_name: entity.openedBy,
      resolution_name: entity.resolution,
    },
    task: {
      id: entity.id,
      name: entity.name,
      assigned_to_name: entity.assignedTo,
      creator_name: entity.openedBy,
      tester_name: entity.finishedBy,
      story_title: entity.story,
    },
  };
}

function renderTemplate(template: string, data: JsonObject): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, token) => {
    const value = readTokenValue(data, String(token).trim().split("."));
    return displayText(value);
  });
}

function renderTemplateValue(value: JsonValue, data: JsonObject): JsonValue {
  if (typeof value === "string") {
    return renderTemplate(value, data);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, data));
  }
  if (isJsonObject(value)) {
    const rendered: JsonObject = {};
    for (const [key, nested] of Object.entries(value)) {
      rendered[key] = nested === undefined ? undefined : renderTemplateValue(nested, data);
    }
    return rendered;
  }
  return value;
}

function readTokenValue(data: JsonObject, pathParts: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = data;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }
  return current;
}

function readFieldValue(context: NotifyContext, field: string): JsonValue | undefined {
  if (field === "status") {
    const changedStatus = normalizeStatusForRule(context.change.new_status_name);
    if (changedStatus) {
      return changedStatus;
    }
    const entityStatus = context.entity.status;
    return typeof entityStatus === "string" ? normalizeStatusForRule(entityStatus) : entityStatus;
  }
  if (field in context.entity) {
    return context.entity[field];
  }
  return undefined;
}

function normalizeStatusForRule(status: string | undefined): string | undefined {
  if (!status) {
    return status;
  }
  const normalized = status.trim().toLowerCase();
  const aliasMap: Record<string, string> = {
    pause: "paused",
    activate: "active",
  };
  return aliasMap[normalized] ?? normalized;
}

function buildSkipped(objectType: SupportedObjectType, eventType: SupportedEventType, reason: string): NotifyResult {
  return {
    ok: true,
    enabled: false,
    object_type: objectType,
    event_type: eventType,
    skipped_reason: reason,
  };
}

function writeAudit(context: NotifyContext, result: NotifyResult): void {
  const entityId = normalizePositiveNumber(context.entity.id);
  writeNotificationAudit({
    id: createNotificationAuditId(`${context.object_type}_${context.event_type}`),
    created_at: new Date().toISOString(),
    object_type: context.object_type,
    event_type: context.event_type,
    entity_id: entityId,
    rule_code: typeof result.rule_code === "string" ? result.rule_code : undefined,
    template: typeof result.template === "string" ? result.template : undefined,
    operator_userid: context.operatorUserid,
    next_dev: toAuditArray(context.extraReceivers?.next_dev),
    next_tester: toAuditArray(context.extraReceivers?.next_tester),
    receivers: Array.isArray(result.sent_to) ? result.sent_to : [],
    skipped_reason: typeof result.skipped_reason === "string" ? result.skipped_reason : undefined,
    ok: result.ok,
    wecom_response: result.wecom_response,
    extra: {
      old_status: context.change.old_status_name,
      new_status: context.change.new_status_name,
      old_assignee: context.change.old_assignee_name,
      new_assignee: context.change.new_assignee_name,
      links: context.links,
    },
  });
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}

function getString(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getUserIds(record: JsonObject, key: string): string[] {
  const value = record[key];
  if (typeof value === "string") {
    return collectUsers(value);
  }
  if (Array.isArray(value)) {
    return collectUsers(
      ...value.map((item) => (typeof item === "string" ? item : String(item))),
    );
  }
  return [];
}

function collectUsers(...values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map(normalizeUserid).filter((item): item is string => Boolean(item))));
}

function normalizeUserid(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized || normalized === "closed" || normalized === "null" || normalized === "undefined") {
    return undefined;
  }
  return normalized;
}

function createReceiverUseridResolver(operatorUserid?: string): ReceiverUseridResolver {
  const client = new ZentaoClient({ userid: operatorUserid });
  const cache = new Map<string, Promise<string | undefined>>();
  const receiverFieldCandidates = [
    "userid",
    "userId",
    "wecomUserId",
    "wecom_userid",
    "weixin",
    "wechat",
    "account",
  ];

  async function lookup(candidate: string): Promise<string | undefined> {
    const normalized = normalizeUserid(candidate);
    if (!normalized) {
      return undefined;
    }

    let matchedUser: JsonObject | null = null;
    try {
      matchedUser = await client.findUserByUserid(normalized);
    } catch {
      try {
        matchedUser = await client.findUserByAccount(normalized);
      } catch {
        matchedUser = null;
      }
    }

    if (!matchedUser) {
      return normalized;
    }

    for (const field of receiverFieldCandidates) {
      const value = matchedUser[field];
      if (typeof value === "string") {
        const resolved = normalizeUserid(value);
        if (resolved) {
          return resolved;
        }
      }
    }

    return normalized;
  }

  return (candidate: string) => {
    const normalized = normalizeUserid(candidate);
    if (!normalized) {
      return Promise.resolve(undefined);
    }
    const cached = cache.get(normalized);
    if (cached) {
      return cached;
    }
    const pending = lookup(normalized);
    cache.set(normalized, pending);
    return pending;
  };
}

function normalizeStringArray(values: string[]): string[] {
  return values.map((item) => item.trim()).filter(Boolean);
}

function stringifyOptional(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function displayText(value: JsonValue | undefined): string {
  return stringifyOptional(value) ?? "-";
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHighBug(bug: JsonObject): boolean {
  return isPriorityHigh(bug.severity) || isPriorityHigh(bug.pri);
}

function isPriorityHigh(value: JsonValue | undefined): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 2;
}

function normalizeBooleanLike(value: JsonValue | undefined): boolean {
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    return value.trim() !== "" && value.trim() !== "0";
  }
  return false;
}

function normalizePositiveNumber(value: JsonValue | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function resolveNextDevForTask(task: JsonObject, relatedStory: JsonObject, input: BaseNotifyInput): string[] {
  const nextStatus = normalizeStatusForRule(input.newStatus ?? getString(task, "status"));
  if (["doing", "blocked", "paused", "delayed", "closed", "canceled"].includes(nextStatus ?? "")) {
    return collectUsers(
      ...getUserIds(task, "assignedTo"),
      ...getUserIds(relatedStory, "assignedTo"),
      ...getUserIds(relatedStory, "openedBy"),
    );
  }
  return [];
}

function resolveNextTesterForTask(task: JsonObject, relatedStory: JsonObject, input: BaseNotifyInput): string[] {
  const nextStatus = normalizeStatusForRule(input.newStatus ?? getString(task, "status"));
  if (["done", "closed", "canceled"].includes(nextStatus ?? "")) {
    return collectUsers(
      ...getUserIds(task, "finishedBy"),
      ...getUserIds(task, "closedBy"),
      ...getUserIds(relatedStory, "reviewedBy"),
      ...getUserIds(relatedStory, "reviewer"),
    );
  }
  return [];
}

function resolveNextDevForBug(bug: JsonObject, relatedStory: JsonObject, input: BaseNotifyInput, eventType: SupportedEventType): string[] {
  if (eventType === "assignee_changed") {
    return collectUsers(input.newAssignee, getString(bug, "assignedTo"));
  }
  const nextStatus = input.newStatus ?? getString(bug, "status");
  if (["activate", "activated", "reopened"].includes(nextStatus ?? "")) {
    return collectUsers(
      input.newAssignee,
      getString(bug, "assignedTo"),
      getString(relatedStory, "assignedTo"),
    );
  }
  if (["created"].includes(nextStatus ?? "")) {
    return collectUsers(getString(bug, "assignedTo"), getString(relatedStory, "assignedTo"));
  }
  return [];
}

function resolveNextTesterForBug(bug: JsonObject, relatedStory: JsonObject, input: BaseNotifyInput, eventType: SupportedEventType): string[] {
  if (eventType === "assignee_changed") {
    return [];
  }
  const nextStatus = input.newStatus ?? getString(bug, "status");
  if (["resolve", "resolved", "close", "closed"].includes(nextStatus ?? "")) {
    return collectUsers(
      getString(bug, "resolvedBy"),
      getString(bug, "closedBy"),
      getString(relatedStory, "reviewedBy"),
      getString(relatedStory, "reviewer"),
      getString(bug, "openedBy"),
    );
  }
  return [];
}

function resolveNextDevForStory(story: JsonObject, input: BaseNotifyInput): string[] {
  const nextStatus = input.newStatus ?? getString(story, "status");
  if (["activate", "active", "planned", "projected", "close", "closed", "suspended", "rejected"].includes(nextStatus ?? "")) {
    return collectUsers(...getUserIds(story, "assignedTo"), ...getUserIds(story, "openedBy"));
  }
  return [];
}

function resolveNextTesterForStory(story: JsonObject, input: BaseNotifyInput): string[] {
  const nextStatus = input.newStatus ?? getString(story, "status");
  if (["done", "verified", "closed", "close"].includes(nextStatus ?? "")) {
    return collectUsers(...getUserIds(story, "reviewedBy"), ...getUserIds(story, "reviewer"), ...getUserIds(story, "closedBy"));
  }
  if (["planned", "projected", "active"].includes(nextStatus ?? "")) {
    return collectUsers(...getUserIds(story, "reviewedBy"), ...getUserIds(story, "reviewer"));
  }
  return [];
}
